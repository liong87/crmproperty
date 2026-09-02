"use server";
/** Lead mutations. Authn + RBAC + Zod + ActionResult on every action. */
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { leads, activities, users, type Lead } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, assertRole, AuthorizationError } from "@/lib/auth";
import { INTEREST, LEAD_STATUS } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadById } from "./queries";

const phoneRe = /^\+[1-9]\d{6,14}$/;

const createSchema = z.object({
  name: z.string().min(1).max(255),
  phone: z.string().regex(phoneRe, "phone must be E.164, e.g. +60123456789"),
  email: z.string().email().max(320).optional().or(z.literal("")).nullable(),
  interest: z.enum(INTEREST).optional().nullable(),
  budgetMin: z.coerce.number().int().nonnegative().optional().nullable(),
  budgetMax: z.coerce.number().int().nonnegative().optional().nullable(),
  preferredAreas: z.string().max(1000).optional().nullable(),
  // The new-launch project this enquiry is for. Null for resale and general enquiries.
  projectId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  consentGiven: z.boolean().optional(),
  /**
   * Freeform lead info — the answers a form asked that have no column of their own.
   * Ours is narrower than the competitor's single blob because interest, budget and
   * preferred areas are structured fields here, which is the point.
   */
  info: z.string().max(4000).optional().nullable(),
  /** Where it came from, in the shape the edit modal offers. */
  sourceDetail: z.string().max(255).optional().nullable(),
  utmCampaign: z.string().max(255).optional().nullable(),
  utmContent: z.string().max(255).optional().nullable(),
  utmTerm: z.string().max(255).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  id: z.string().uuid(),
  status: z.enum(LEAD_STATUS).optional(),
});

function guardConverted(lead: Lead): void {
  if (lead.convertedToContactId) {
    throw new AuthorizationError("This lead has been qualified and is now read-only.");
  }
}

export async function createLead(input: unknown): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    const d = createSchema.parse(input);
    // Agents may only assign to themselves; team leads/admins may assign to anyone.
    let assignedTo = d.assignedTo ?? me.id;
    if (me.role === "agent") assignedTo = me.id;

    const [row] = await db
      .insert(leads)
      .values({
        name: d.name,
        phone: d.phone,
        email: d.email || null,
        source: "manual",
        interest: d.interest ?? null,
        budgetMin: d.budgetMin ?? null,
        budgetMax: d.budgetMax ?? null,
        preferredAreas: d.preferredAreas ?? null,
        projectId: d.projectId ?? null,
        status: "new",
        assignedTo,
        consentGivenAt: d.consentGiven ? new Date() : null,
        consentSource: d.consentGiven ? "manual" : null,
      })
      .returning();

    await db.insert(activities).values({
      entityType: "leads",
      entityId: row!.id,
      type: "note",
      body: `Lead created manually by ${me.name}.`,
      createdBy: me.id,
    });

    revalidatePath("/leads");
    return ok(row!);
  } catch (err) {
    return handle(err, "createLead");
  }
}

export async function updateLead(input: unknown): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    const d = updateSchema.parse(input);
    const lead = await getLeadById(d.id);
    if (!lead) return fail("Lead not found.");
    assertCanEdit(me, lead.assignedTo);
    guardConverted(lead);

    // Only team leads/admins can reassign.
    const assignedTo =
      d.assignedTo !== undefined && me.role !== "agent" ? d.assignedTo : lead.assignedTo;

    const [row] = await db
      .update(leads)
      .set({
        name: d.name ?? lead.name,
        phone: d.phone ?? lead.phone,
        email: d.email !== undefined ? d.email || null : lead.email,
        interest: d.interest !== undefined ? d.interest : lead.interest,
        budgetMin: d.budgetMin !== undefined ? d.budgetMin : lead.budgetMin,
        budgetMax: d.budgetMax !== undefined ? d.budgetMax : lead.budgetMax,
        preferredAreas: d.preferredAreas !== undefined ? d.preferredAreas : lead.preferredAreas,
        projectId: d.projectId !== undefined ? d.projectId : lead.projectId,
        status: d.status ?? lead.status,
        info: d.info !== undefined ? d.info : lead.info,
        sourceDetail: d.sourceDetail !== undefined ? d.sourceDetail : lead.sourceDetail,
        utmCampaign: d.utmCampaign !== undefined ? d.utmCampaign : lead.utmCampaign,
        utmContent: d.utmContent !== undefined ? d.utmContent : lead.utmContent,
        utmTerm: d.utmTerm !== undefined ? d.utmTerm : lead.utmTerm,
        assignedTo,
      })
      .where(eq(leads.id, d.id))
      .returning();

    revalidatePath("/leads");
    revalidatePath(`/leads/${d.id}`);
    revalidatePath("/working-leads");
    return ok(row!);
  } catch (err) {
    return handle(err, "updateLead");
  }
}

export async function disqualifyLead(id: string): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    const lead = await getLeadById(id);
    if (!lead) return fail("Lead not found.");
    assertCanEdit(me, lead.assignedTo);
    guardConverted(lead);

    const [row] = await db
      .update(leads)
      .set({ status: "not-searching" })
      .where(eq(leads.id, id))
      .returning();
    await db.insert(activities).values({
      entityType: "leads",
      entityId: id,
      type: "note",
      body: `Lead marked Not Searching by ${me.name}.`,
      createdBy: me.id,
    });
    revalidatePath("/leads");
    return ok(row!);
  } catch (err) {
    return handle(err, "disqualifyLead");
  }
}

/**
 * Move a lead to another agent.
 *
 * @param reason optional, and recorded on the timeline when given.
 *
 * Reassignment is the one lead operation with a loser. Moving a lead moves the
 * commission that might come from it, so an unexplained transfer discovered later is
 * how an agent concludes the system is being used against them. Writing the reason to
 * the timeline costs one insert and makes the decision reviewable — including by the
 * agent it was taken from, who can see it on the lead.
 *
 * Never automatic. Nothing in this application reassigns a lead on a timer; see the
 * note in server/leads/stale.ts for why.
 */
export async function assignLead(
  id: string,
  assignedTo: string,
  reason?: string,
): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const parsed = z.string().uuid().parse(assignedTo);

    // Read the previous owner before the update, so the note can name both ends of
    // the move. "Reassigned to Siew Ling" alone does not say who lost it.
    const before = await getLeadById(id);
    if (!before) return fail("Lead not found.");
    if (before.assignedTo === parsed) return ok(before);

    const [row] = await db
      .update(leads)
      .set({
        assignedTo: parsed,
        // Counted here because this is the only path ownership changes through, and
        // each reassignment otherwise overwrites all trace of the last one.
        recycleCount: sql`${leads.recycleCount} + 1`,
      })
      .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
      .returning();
    if (!row) return fail("Lead not found.");

    const [[from], [to]] = await Promise.all([
      before.assignedTo
        ? db.select({ name: users.name }).from(users).where(eq(users.id, before.assignedTo))
        : Promise.resolve([{ name: "Unassigned" }]),
      db.select({ name: users.name }).from(users).where(eq(users.id, parsed)),
    ]);

    const trimmed = reason?.trim();
    try {
      await db.insert(activities).values({
        entityType: "leads",
        entityId: id,
        type: "note",
        body:
          `Reassigned from ${from?.name ?? "Unassigned"} to ${to?.name ?? "another agent"}` +
          ` by ${me.name}.${trimmed ? ` Reason: ${trimmed}` : ""}`,
        createdBy: me.id,
      });
    } catch (noteErr) {
      // The reassignment itself succeeded. Losing the note is worth reporting but not
      // worth telling the manager the move failed when it did not.
      monitoring.captureException(noteErr, { where: "assignLead.note" });
    }

    revalidatePath("/leads");
    revalidatePath("/leads/stale");
    return ok(row);
  } catch (err) {
    return handle(err, "assignLead");
  }
}

/**
 * Remove a lead — admin only.
 *
 * Soft delete: the row is hidden everywhere (every list query filters on
 * `deletedAt is null`) but remains in the database, so a mistake is recoverable and
 * the PDPA purge still hard-deletes it on the normal 24-month schedule.
 *
 * Admin rather than manager, deliberately. Disqualifying already removes a lead from
 * everyday view, so deletion is for junk that should never have existed — spam,
 * duplicates, test records. Restricting it keeps a client's enquiry history from
 * being cleared by anyone who happens to find it inconvenient.
 *
 * A converted lead cannot be deleted: it is the origin of a live contact, and the
 * contact page links back to it.
 */
/**
 * Delete several leads at once.
 *
 * Admin only, matching deleteLead — an agent who can erase leads can erase the
 * evidence of ones they never worked, and stale-lead flagging depends on unworked
 * leads staying visible.
 *
 * Partial success is reported rather than hidden: a lead that has become a contact
 * is skipped, not deleted, and the caller is told how many. Failing the whole batch
 * because one row is ineligible would make clearing test data needlessly fiddly.
 */
export async function deleteLeads(
  ids: string[],
): Promise<ActionResult<{ deleted: number; skipped: number }>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin");

    const parsed = z.array(z.string().uuid()).min(1).max(200).safeParse(ids);
    if (!parsed.success) return fail("Select at least one lead to delete.");
    const unique = [...new Set(parsed.data)];

    // Converted leads are owned by their contact; deleting one here would orphan it.
    const eligible = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          inArray(leads.id, unique),
          isNull(leads.deletedAt),
          isNull(leads.convertedToContactId),
        ),
      );

    const eligibleIds = eligible.map((r) => r.id);
    const skipped = unique.length - eligibleIds.length;

    if (eligibleIds.length === 0) {
      return fail(
        skipped > 0
          ? "Those leads became contacts and cannot be deleted. Delete the contacts instead."
          : "Nothing to delete.",
      );
    }

    await db
      .update(leads)
      .set({ deletedAt: new Date() })
      .where(inArray(leads.id, eligibleIds));

    // Bulk removal of client records should never be silent, even a soft one.
    monitoring.captureMessage("Leads bulk deleted", {
      count: String(eligibleIds.length),
      skipped: String(skipped),
      by: me.id,
    });

    revalidatePath("/leads");
    return ok({ deleted: eligibleIds.length, skipped });
  } catch (err) {
    return handle(err, "deleteLeads");
  }
}

export async function deleteLead(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin");
    z.string().uuid().parse(id);

    const existing = await getLeadById(id);
    if (!existing) return fail("Lead not found.");
    if (existing.convertedToContactId) {
      return fail("This lead became a contact and cannot be deleted. Delete the contact instead.");
    }

    await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));
    // Bulk removal of a client record should never be silent, even a soft one.
    monitoring.captureMessage("Lead deleted", { leadId: id, by: me.id });

    revalidatePath("/leads");
  } catch (err) {
    return handle(err, "deleteLead");
  }
  redirect("/leads");
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail(err.message);
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
