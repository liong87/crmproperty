/**
 * Shared lead intake pipeline — ALL sources (public API, webhook, manual, import)
 * funnel through createLeadFromIntake so behaviour is identical everywhere.
 *
 * Responsibilities:
 *  - Validate payload (Zod)
 *  - Deduplicate by phone/email (merge into existing lead + log an activity)
 *  - Capture UTM / referrer
 *  - Auto-assign via round-robin (counter persisted in DB — NEVER in memory)
 *  - Trigger notifications (WhatsApp link to agent; optional confirmation to customer)
 *  - Log to activity + message_log
 */
import { z } from "zod";
import { and, eq, isNull, ne, or, asc, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, users, activities, assignmentCounter, leadAssignments } from "@/lib/db/schema";
import { pickFromPool } from "./pool";
import { messaging } from "@/lib/messaging";
import { monitoring } from "@/lib/monitoring";
import { LEAD_SOURCE, INTEREST } from "@/lib/constants";
import type { ActionResult } from "@/types";
import { ok, fail } from "@/lib/action-result";

const ROUND_ROBIN_KEY = "lead_round_robin";

export const intakeSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, "phone must be E.164, e.g. +60123456789"),
  email: z.string().email().max(320).optional().nullable(),
  interest: z.enum(INTEREST).optional().nullable(),
  budgetMin: z.number().int().nonnegative().optional().nullable(),
  budgetMax: z.number().int().nonnegative().optional().nullable(),
  preferredAreas: z.string().max(1000).optional().nullable(),
  sourceDetail: z.string().max(255).optional().nullable(),
  // The new-launch project this enquiry is for, when the source knows it.
  projectId: z.string().uuid().optional().nullable(),
  utmSource: z.string().max(255).optional().nullable(),
  utmMedium: z.string().max(255).optional().nullable(),
  utmCampaign: z.string().max(255).optional().nullable(),
  // Ad set and ad. See the note on the columns in lib/db/schema.ts.
  utmContent: z.string().max(255).optional().nullable(),
  utmTerm: z.string().max(255).optional().nullable(),
  referrer: z.string().optional().nullable(),
  // PDPA: public intake MUST record consent.
  consentGiven: z.boolean().optional(),
  consentSource: z.string().max(255).optional().nullable(),
  // anti-spam honeypot — must be empty
  hp: z.string().optional(),
});

export type IntakePayload = z.infer<typeof intakeSchema>;
export type LeadSource = (typeof LEAD_SOURCE)[number];

/**
 * Round-robin assignment using a DB-persisted counter.
 *
 * The counter is incremented in ONE statement and the new value returned, so two
 * leads arriving at the same moment (a landing page plus a webhook, or any CSV
 * import) cannot read the same index. The previous version did SELECT then UPDATE
 * as separate round trips: concurrent leads went to the same agent and the counter
 * advanced by one instead of two.
 *
 * The stored value is monotonically increasing and the modulo is applied at read
 * time. Storing the post-modulo value - as it did before - meant the counter was
 * bounded by the *current* agent count, so adding or deactivating an agent made the
 * rotation jump instead of continuing.
 */
async function pickAssignee(): Promise<string | null> {
  const agents = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), eq(users.role, "agent"), isNull(users.deletedAt)))
    .orderBy(asc(users.createdAt));

  if (agents.length === 0) return null;

  const rows = (await db.execute(sql`
    insert into assignment_counter (id, last_index)
    values (${ROUND_ROBIN_KEY}, 0)
    on conflict (id) do update set last_index = assignment_counter.last_index + 1,
                                   updated_at = now()
    returning last_index
  `)) as unknown as Array<{ last_index: number }>;

  const ticket = Number(rows[0]?.last_index ?? 0);
  return agents[ticket % agents.length]?.id ?? null;
}

/**
 * @param assignTo  Force the assignee instead of using round-robin.
 *
 * Used by CSV import, where the leads belong to whoever uploaded them: an agent
 * importing their own Facebook Lead Ads export would otherwise watch most of that
 * list scatter across the team by round-robin, and lose sight of leads they sourced
 * and paid for. Website and webhook leads keep round-robin — nobody owns those, and
 * waiting for a manual assignment costs conversions.
 */
export async function createLeadFromIntake(
  rawPayload: unknown,
  source: LeadSource,
  assignTo?: string | null,
): Promise<ActionResult<{ leadId: string; deduped: boolean }>> {
  const parsed = intakeSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const p = parsed.data;

  // Honeypot: silently accept-and-drop spam (return a fake success shape).
  if (p.hp && p.hp.trim() !== "") {
    return ok({ leadId: "spam-ignored", deduped: false });
  }

  try {
    // Dedup by phone or email among OPEN, non-deleted leads only.
    //
    // Previously this matched any lead, including ones already converted to a
    // contact or marked disqualified. A past client enquiring again was matched to
    // their old, read-only record: the pipeline appended a note nobody reads,
    // reported success, and the new enquiry was never created and never assigned to
    // anyone. For a returning-customer business that is silent lost revenue.
    //
    // Also ordered and limited: without ORDER BY, PostgreSQL row order is
    // unspecified, so which lead received the duplicate note could vary run to run.
    const existingMatches = await db
      .select()
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          isNull(leads.convertedToContactId),
          ne(leads.status, "disqualified"),
          p.email
            ? or(eq(leads.phone, p.phone), eq(leads.email, p.email))
            : eq(leads.phone, p.phone),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(1);
    const existing = existingMatches[0];

    if (existing) {
      // Merge: log a new activity on the existing lead rather than duplicating.
      await db.insert(activities).values({
        entityType: "leads",
        entityId: existing.id,
        type: "note",
        body: `Duplicate inquiry received via ${source}${p.sourceDetail ? ` (${p.sourceDetail})` : ""}.`,
      });
      return ok({ leadId: existing.id, deduped: true });
    }

    /**
     * undefined means "decide for me"; an explicit id or null is honoured.
     *
     * A lead that names a project goes to that project's pool first, so the people
     * working a launch get its leads. A project with no pool — and every lead with no
     * project at all — falls back to the global rotation, which is the behaviour that
     * existed before pools and must keep working.
     */
    let assignedTo: string | null;
    let assignReason: "round-robin" | "pool" | "manual" = "round-robin";
    if (assignTo !== undefined) {
      assignedTo = assignTo;
      assignReason = "manual";
    } else {
      const fromPool = p.projectId ? await pickFromPool(p.projectId) : null;
      if (fromPool) {
        assignedTo = fromPool;
        assignReason = "pool";
      } else {
        assignedTo = await pickAssignee();
      }
    }

    const [inserted] = await db
      .insert(leads)
      .values({
        name: p.name,
        phone: p.phone,
        email: p.email ?? null,
        source,
        sourceDetail: p.sourceDetail ?? null,
        utmSource: p.utmSource ?? null,
        utmMedium: p.utmMedium ?? null,
        utmCampaign: p.utmCampaign ?? null,
        utmContent: p.utmContent ?? null,
        utmTerm: p.utmTerm ?? null,
        referrer: p.referrer ?? null,
        interest: p.interest ?? null,
        budgetMin: p.budgetMin ?? null,
        budgetMax: p.budgetMax ?? null,
        preferredAreas: p.preferredAreas ?? null,
        projectId: p.projectId ?? null,
        status: "new",
        assignedTo,
        // Starts the pass-on clock. Null when nobody owns it, so an unassigned lead is
        // never counted as overdue against a person who does not exist.
        assignedAt: assignedTo ? new Date() : null,
        consentGivenAt: p.consentGiven ? new Date() : null,
        consentSource: p.consentSource ?? null,
      })
      .returning({ id: leads.id });

    const leadId = inserted!.id;

    // The first entry in the chain of custody. Written even when nobody was assigned,
    // because "arrived and went to no one" is itself worth being able to see later.
    try {
      await db.insert(leadAssignments).values({
        leadId,
        fromUserId: null,
        toUserId: assignedTo,
        reason: assignReason,
        note: `Lead created via ${source}${p.sourceDetail ? ` (${p.sourceDetail})` : ""}.`,
      });
    } catch (histErr) {
      // The lead exists and is assigned; losing the history row is worth reporting but
      // not worth failing the intake and making the platform retry.
      monitoring.captureException(histErr, { where: "createLeadFromIntake.history" });
    }

    // Log intake activity.
    await db.insert(activities).values({
      entityType: "leads",
      entityId: leadId,
      type: "note",
      body: `Lead created via ${source}${p.sourceDetail ? ` (${p.sourceDetail})` : ""}.`,
    });

    // Notify assigned agent (WhatsApp click-to-chat link in Phase A).
    if (assignedTo) {
      const [agent] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, assignedTo));
      if (agent?.phone) {
        try {
          await messaging.sendFollowUp(agent.phone, {
            message: `New lead assigned: ${p.name} (${p.phone}).`,
          });
        } catch (notifyErr) {
          monitoring.captureException(notifyErr, { where: "intake.notify" });
        }
      }
    }

    return ok({ leadId, deduped: false });
  } catch (err) {
    monitoring.captureException(err, { where: "createLeadFromIntake", source });
    return fail("Failed to create lead.");
  }
}
