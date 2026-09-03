"use server";
/**
 * The remark thread on a lead. Append only.
 *
 * The rule that makes the whole thing work: a status change and a remark are ONE
 * action. You cannot move a lead without saying why. That is what keeps the history
 * complete, and it is why the follow-up rate can be trusted at all — the number counts
 * remarks, and remarks are the only way status moves.
 *
 * There is deliberately no update and no delete. This is an audit trail; the UI offers
 * no edit affordance because the server offers no edit action.
 */
import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { activities, leadRemarks, leads, users } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { LEAD_STATUS } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadById } from "./queries";
import { assertCanEditOwned } from "@/server/auth/ownership";

/**
 * NOTE ON THIS FILE: it carries "use server", and two Client Components import
 * `addRemark` from it. That makes EVERY export here a browser-callable endpoint, so
 * every export must authenticate and authorize for itself. A helper that relies on its
 * caller having already done so belongs in ./remarks-internal.ts, which has no
 * directive. `listRemarks` (unauthenticated, unused) and `addSystemRemark` (no
 * ownership check, wrote lead status) both used to live here.
 */

const addSchema = z
  .object({
    leadId: z.string().uuid(),
    body: z.string().max(2000).optional().nullable(),
    status: z.enum(LEAD_STATUS).optional().nullable(),
  })
  .refine((d) => (d.body && d.body.trim().length > 0) || d.status, {
    message: "Write something, or pick a status.",
  });

export async function addRemark(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const d = addSchema.parse(input);

    const lead = await getLeadById(d.leadId);
    if (!lead) return fail("Lead not found.");
    await assertCanEditOwned(me, lead.assignedTo);

    const body = d.body?.trim() || null;

    const [row] = await db
      .insert(leadRemarks)
      .values({ leadId: d.leadId, userId: me.id, body, status: d.status ?? null, kind: "manual" })
      .returning({ id: leadRemarks.id });

    /*
     * Status and counters move in the same statement as the remark's existence, so
     * there is no window in which a lead has a new status and no reason recorded.
     *
     * Counters are incremented rather than recomputed: a count(*) over the thread would
     * be correct too, but it grows with the thread and this runs on every save.
     */
    await db
      .update(leads)
      .set({
        ...(d.status ? { status: d.status } : {}),
        lastFollowUpAt: new Date(),
        followUpCount: sql`${leads.followUpCount} + 1`,
      })
      .where(eq(leads.id, d.leadId));

    /*
     * Also written to the activity timeline. One action, two records serving two
     * views: the thread is what an agent reads on this lead, activities are what the
     * per-agent effort report counts. Deriving one from the other at read time would
     * mean a join on every report row for no benefit.
     */
    try {
      await db.insert(activities).values({
        entityType: "leads",
        entityId: d.leadId,
        type: "note",
        body: body ?? `Status set to ${d.status}`,
        occurredAt: new Date(),
        createdBy: me.id,
      });
    } catch (err) {
      // The remark is saved and the status applied; losing the timeline copy is worth
      // reporting but not worth telling the agent their note failed when it did not.
      monitoring.captureException(err, { where: "addRemark.activity", leadId: d.leadId });
    }

    revalidatePath("/working-leads");
    revalidatePath("/leads");
    revalidatePath(`/leads/${d.leadId}`);
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "addRemark");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("That lead is not yours to update.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
