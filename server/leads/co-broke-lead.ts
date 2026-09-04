"use server";
/**
 * Internal co-broke: give a lead to a colleague and keep a claim on it.
 *
 * WHY THIS IS NOT `assignLead`:
 *
 * `assignLead` is a MANAGER moving somebody else's work. It requires admin or team
 * lead, and it takes the lead off one agent and gives it to another with no residue —
 * which is right for correcting an assignment, and wrong for co-broking.
 *
 * This is an AGENT co-broking their own lead. Two differences follow from that:
 *
 *   1. The agent needs no special role. They own the lead; they may pass it on. What
 *      they cannot do is take somebody else's, and the ownership check below is what
 *      keeps those two apart.
 *
 *   2. They keep a claim. `leads.setter_id` records who sourced it, and when an
 *      appointment is later booked that person becomes the appointment's SETTER while
 *      the new owner becomes the CLOSER — a split `deal_commission_splits` already
 *      knows how to pay. Without that, an agent who cannot close a lead has every
 *      reason to sit on it until it goes cold rather than give a colleague the
 *      commission, which is the exact behaviour a co-broke feature exists to stop.
 *
 * The co-broke LANDS. There is no accept step, matching the automatic pass-on that
 * already works this way: five people share a room, and a co-broke is normally agreed
 * out loud before anyone clicks. Both agents are notified, and the move is written to
 * the append-only `lead_assignments` trail plus the lead's timeline, so it is never
 * something either of them discovers by accident.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leads, users, activities, leadAssignments, type Lead } from "@/lib/db/schema";
import { requireDbUser, isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { notify } from "@/lib/notify";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadById } from "./queries";

const schema = z.object({
  leadId: z.string().uuid(),
  toUserId: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});

export async function coBrokeLead(input: unknown): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    const d = schema.parse(input);

    const lead = await getLeadById(d.leadId);
    if (!lead) return fail("Lead not found.");

    /*
     * You may hand over YOUR OWN lead. A team lead or admin may also hand over one
     * they oversee, because they can already reassign it outright and refusing the
     * gentler action would be strange.
     *
     * Deliberately NOT `assertCanEditOwned`: that answers "may this person change this
     * record", and an agent may change a colleague's lead in none of the ways that
     * matter here. The question this action asks is narrower — is it yours to give.
     */
    const mine = lead.assignedTo != null && lead.assignedTo === me.id;
    if (!mine && !isTeamLeadOrAbove(me)) {
      return fail("You can only co-broke a lead assigned to you.");
    }

    // A converted lead is read-only; the client relationship lives on the contact now.
    if (lead.convertedToContactId) {
      return fail("This lead has already been qualified into a contact, so it can no longer be co-broked.");
    }
    if (lead.assignedTo === d.toUserId) {
      return fail("That agent already has this lead.");
    }

    const [target] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.id, d.toUserId), eq(users.active, true), isNull(users.deletedAt)));
    if (!target) return fail("That agent is not active.");

    const previousOwner = lead.assignedTo;

    const [row] = await db
      .update(leads)
      .set({
        assignedTo: d.toUserId,
        /*
         * THE FIRST CO-BROKE WINS. A lead passed from Aisyah to Wei Ming to Siew Ling
         * still credits Aisyah, who is the person who actually brought it in.
         * Overwriting on each hop would quietly transfer the setter's claim to
         * whoever happened to touch it second.
         */
        setterId: lead.setterId ?? previousOwner,
        // The pass-on sweep measures how long the CURRENT owner has sat on it.
        assignedAt: new Date(),
        recycleCount: sql`${leads.recycleCount} + 1`,
      })
      .where(and(eq(leads.id, d.leadId), isNull(leads.deletedAt)))
      .returning();
    if (!row) return fail("Lead not found.");

    const fromName = previousOwner
      ? (await db.select({ name: users.name }).from(users).where(eq(users.id, previousOwner)))[0]?.name
      : null;
    const note = d.note?.trim() || null;

    // The trail and the notifications are best-effort: the co-broke itself has already
    // happened, and telling the agent it failed when it did not is worse than a
    // missing note.
    try {
      await db.insert(leadAssignments).values({
        leadId: d.leadId,
        fromUserId: previousOwner,
        toUserId: d.toUserId,
        reason: "co-broke",
        note,
        createdBy: me.id,
      });

      await db.insert(activities).values({
        entityType: "leads",
        entityId: d.leadId,
        type: "note",
        body:
          `Co-broked from ${fromName ?? "Unassigned"} to ${target.name} by ${me.name}. ` +
          `${fromName ?? "The previous owner"} stays the setter on this lead.` +
          (note ? ` Note: ${note}` : ""),
        createdBy: me.id,
      });

      const key = `co-broke:${d.leadId}:${Date.now()}`;
      await notify({
        userId: d.toUserId,
        kind: "lead-co-broked",
        title: `Co-broke from ${fromName ?? "a colleague"}: ${lead.name}`,
        body: `${lead.phone} — from ${fromName ?? "an unassigned record"}.${note ? ` ${note}` : ""}`,
        link: `/leads/${d.leadId}`,
        entityType: "leads",
        entityId: d.leadId,
        dedupeKey: `${key}:in`,
      });
      // The person giving it away is told too, so a team lead moving it on their behalf
      // is never something they find out about by noticing it has gone.
      if (previousOwner && previousOwner !== me.id) {
        await notify({
          userId: previousOwner,
          kind: "lead-co-broked",
          title: `Co-broked to ${target.name}: ${lead.name}`,
          body: `You stay the setter on this lead.${note ? ` ${note}` : ""}`,
          link: `/leads/${d.leadId}`,
          entityType: "leads",
          entityId: d.leadId,
          dedupeKey: `${key}:out`,
        });
      }
    } catch (trailErr) {
      monitoring.captureException(trailErr, { where: "coBrokeLead.trail", leadId: d.leadId });
    }

    revalidatePath("/leads");
    revalidatePath(`/leads/${d.leadId}`);
    revalidatePath("/working-leads");
    return ok(row);
  } catch (err) {
    if (err instanceof AuthorizationError) return fail(err.message);
    if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "coBrokeLead" });
    return fail("Failed to co-broke this lead.");
  }
}
