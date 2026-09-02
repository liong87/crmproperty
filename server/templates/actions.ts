"use server";
/**
 * Message template management.
 *
 * Reading is open to any active staff member — agents need the list to send from.
 * Writing is restricted to team leads and admins: templates are the agency's voice to
 * clients, and letting fifteen agents each edit the shared wording defeats the point
 * of having them.
 */
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { messageTemplates } from "@/lib/db/schema";
import { requireDbUser, isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

export interface TemplateRow {
  id: string;
  key: string;
  channel: string;
  body: string;
  active: boolean;
}

const schema = z.object({
  // Stored lowercase with underscores so it reads as an identifier, not a title.
  key: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only."),
  channel: z.enum(["whatsapp", "email"]),
  body: z.string().min(1).max(4000),
  active: z.boolean().optional(),
});

/** Templates an agent can pick from. Active only, ordered for a stable dropdown. */
export async function listActiveTemplates(channel = "whatsapp"): Promise<TemplateRow[]> {
  await requireDbUser();
  return db
    .select({
      id: messageTemplates.id,
      key: messageTemplates.key,
      channel: messageTemplates.channel,
      body: messageTemplates.body,
      active: messageTemplates.active,
    })
    .from(messageTemplates)
    .where(
      and(
        isNull(messageTemplates.deletedAt),
        eq(messageTemplates.active, true),
        eq(messageTemplates.channel, channel),
      ),
    )
    .orderBy(asc(messageTemplates.key));
}

/** Every template including inactive ones — for the management screen. */
export async function listAllTemplates(): Promise<TemplateRow[]> {
  const me = await requireDbUser();
  if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
  return db
    .select({
      id: messageTemplates.id,
      key: messageTemplates.key,
      channel: messageTemplates.channel,
      body: messageTemplates.body,
      active: messageTemplates.active,
    })
    .from(messageTemplates)
    .where(isNull(messageTemplates.deletedAt))
    .orderBy(asc(messageTemplates.channel), asc(messageTemplates.key));
}

export async function createTemplate(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
    const d = schema.parse(input);

    const [row] = await db
      .insert(messageTemplates)
      .values({ key: d.key, channel: d.channel, body: d.body, active: d.active ?? true })
      .returning({ id: messageTemplates.id });

    revalidatePath("/templates");
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "createTemplate");
  }
}

export async function updateTemplate(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
    const d = schema.extend({ id: z.string().uuid() }).parse(input);

    await db
      .update(messageTemplates)
      .set({ key: d.key, channel: d.channel, body: d.body, active: d.active ?? true })
      .where(eq(messageTemplates.id, d.id));

    revalidatePath("/templates");
    return ok(undefined);
  } catch (err) {
    return handle(err, "updateTemplate");
  }
}

/**
 * Soft delete. Templates are referenced by nothing, but message history reads better
 * when the wording that was sent can still be looked up.
 */
export async function deleteTemplate(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
    z.string().uuid().parse(id);

    await db
      .update(messageTemplates)
      .set({ deletedAt: new Date() })
      .where(eq(messageTemplates.id, id));

    revalidatePath("/templates");
    return ok(undefined);
  } catch (err) {
    return handle(err, "deleteTemplate");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) {
    return fail("Only team leads and administrators can change templates.");
  }
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  // A duplicate key is a user mistake, not a system fault — say so plainly.
  if (err instanceof Error && /unique|duplicate/i.test(err.message)) {
    return fail("A template with that name already exists.");
  }
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
