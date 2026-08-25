"use server";
/** Lead mutations. Authn + RBAC + Zod + ActionResult on every action. */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { leads, activities, type Lead } from "@/lib/db/schema";
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
    // Agents may only assign to themselves; managers/admins may assign to anyone.
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

    // Only managers/admins can reassign.
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
        assignedTo,
      })
      .where(eq(leads.id, d.id))
      .returning();

    revalidatePath("/leads");
    revalidatePath(`/leads/${d.id}`);
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
      .set({ status: "disqualified" })
      .where(eq(leads.id, id))
      .returning();
    await db.insert(activities).values({
      entityType: "leads",
      entityId: id,
      type: "note",
      body: `Lead disqualified by ${me.name}.`,
      createdBy: me.id,
    });
    revalidatePath("/leads");
    return ok(row!);
  } catch (err) {
    return handle(err, "disqualifyLead");
  }
}

export async function assignLead(id: string, assignedTo: string): Promise<ActionResult<Lead>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const parsed = z.string().uuid().parse(assignedTo);
    const [row] = await db
      .update(leads)
      .set({ assignedTo: parsed })
      .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
      .returning();
    if (!row) return fail("Lead not found.");
    revalidatePath("/leads");
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
