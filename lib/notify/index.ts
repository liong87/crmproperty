/**
 * Telling somebody something.
 *
 * One entry point, two channels. The in-app row is written first and always; email is
 * attempted afterwards and is allowed to fail. That ordering is the whole design:
 *
 *  - **Notifying must never break the thing that triggered it.** A pass-on that throws
 *    because an email bounced has lost a lead to protect a message about a lead.
 *    Everything here is caught and recorded.
 *  - **Email is optional.** With no RESEND_API_KEY the row is still created and marked
 *    `skipped`, so the inbox works today and email starts working the day the key is
 *    added, with no code change.
 *  - **Repeats are the caller's problem, solved once.** Scheduled jobs re-evaluate the
 *    same facts nightly. Pass a `dedupeKey` describing the FACT and the second attempt
 *    is silently dropped by a unique index rather than becoming a second message.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, users } from "@/lib/db/schema";
import { email } from "@/lib/email";
import { monitoring } from "@/lib/monitoring";

export type NotificationKind =
  | "lead-passed-on"
  | "lead-assigned"
  | "document-due"
  | "appointment-reminder"
  | "digest";

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** Relative path within the app, e.g. `/leads/abc`. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /**
   * Identifies the FACT, not the moment. `doc-due:<id>:<dueDate>` re-notifies when the
   * deadline moves and stays quiet otherwise. Omit for one-off, human-triggered events.
   */
  dedupeKey?: string | null;
  /** Skip email even when it is configured — for chatter that does not deserve an inbox. */
  emailOptOut?: boolean;
}

export interface NotifyResult {
  created: boolean;
  id?: string;
  /** Why nothing was created, when nothing was. */
  reason?: "duplicate" | "no-recipient" | "error";
}

const emailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** The app's own URL, for links inside an email. Relative links are useless there. */
const appUrl = () => (process.env.APP_URL ?? "").replace(/\/+$/, "");

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  try {
    const [recipient] = await db
      .select({ id: users.id, name: users.name, email: users.email, active: users.active })
      .from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));

    // Somebody who has left should not be notified, and their row is not an error.
    if (!recipient || !recipient.active) return { created: false, reason: "no-recipient" };

    const willEmail = !input.emailOptOut && emailConfigured() && Boolean(recipient.email);

    const rows = await db
      .insert(notifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        emailStatus: willEmail ? "queued" : "skipped",
      })
      // The unique index on (user_id, dedupe_key) does the work. A repeat returns no
      // row, which is the signal that this fact has already been said.
      .onConflictDoNothing()
      .returning({ id: notifications.id });

    const row = rows[0];
    if (!row) return { created: false, reason: "duplicate" };

    if (willEmail) {
      await sendEmail(row.id, recipient.email, input);
    }

    return { created: true, id: row.id };
  } catch (err) {
    // Never propagate. The caller is doing something that matters more than this.
    monitoring.captureException(err, { where: "notify", kind: input.kind });
    return { created: false, reason: "error" };
  }
}

/** Best-effort. Records the outcome on the notification rather than throwing. */
async function sendEmail(id: string, to: string, input: NotifyInput): Promise<void> {
  try {
    const base = appUrl();
    const href = input.link && base ? `${base}${input.link}` : null;
    const bodyHtml = input.body ? `<p>${escapeHtml(input.body)}</p>` : "";
    const linkHtml = href
      ? `<p><a href="${href}">Open in Lanthorn Properties CRM</a></p>`
      : `<p>Open Lanthorn Properties CRM to see it.</p>`;

    const { id: providerId } = await email.send({
      to,
      subject: input.title,
      html: `<p><strong>${escapeHtml(input.title)}</strong></p>${bodyHtml}${linkHtml}`,
      text: [input.title, input.body ?? "", href ?? ""].filter(Boolean).join("\n\n"),
    });

    await db
      .update(notifications)
      .set({ emailStatus: "sent", emailError: providerId ? null : null })
      .where(eq(notifications.id, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(notifications)
      .set({ emailStatus: "failed", emailError: message.slice(0, 500) })
      .where(eq(notifications.id, id))
      .catch(() => {});
    monitoring.captureException(err, { where: "notify.email" });
  }
}

/** Notify several people, independently — one failure does not stop the rest. */
export async function notifyMany(inputs: NotifyInput[]): Promise<NotifyResult[]> {
  const out: NotifyResult[] = [];
  for (const input of inputs) out.push(await notify(input));
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Unread count for the nav badge. */
export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      isNull(notifications.deletedAt),
    ));
  return rows[0]?.n ?? 0;
}
