"use server";
/**
 * Lead → Contact conversion (the "Qualify" action).
 *
 * Rules (prompt_crm_v2.md):
 *  - Qualifying creates a contact, copies all person + consent fields.
 *  - Sets leads.converted_to_contact_id and lead status = 'qualified'.
 *  - The lead row is never deleted; it becomes read-only (guarded in lead actions).
 *  - Activities on the lead stay on the lead; new activities go on the contact.
 *  - Deals can only be created against contacts.
 *
 * Note: Neon HTTP driver has no interactive transactions. We order writes so the
 * contact exists before the lead is flipped; contact carries source_lead_id, so a
 * mid-way failure is recoverable and never loses the link.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leads, contacts, activities } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadById } from "./queries";

export async function qualifyLead(
  leadId: string,
): Promise<ActionResult<{ contactId: string; alreadyConverted: boolean }>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(leadId);

    const lead = await getLeadById(leadId);
    if (!lead) return fail("Lead not found.");
    assertCanEdit(me, lead.assignedTo);

    if (lead.convertedToContactId) {
      return ok({ contactId: lead.convertedToContactId, alreadyConverted: true });
    }

    // 1. Create the contact, copying person + consent fields.
    const [contact] = await db
      .insert(contacts)
      .values({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        interest: lead.interest,
        budgetMin: lead.budgetMin,
        budgetMax: lead.budgetMax,
        preferredAreas: lead.preferredAreas,
        assignedTo: lead.assignedTo,
        consentGivenAt: lead.consentGivenAt,
        consentSource: lead.consentSource,
        sourceLeadId: lead.id,
      })
      .returning({ id: contacts.id });

    const contactId = contact!.id;

    // 2. Flip the lead: qualified + linked (becomes read-only).
    await db
      .update(leads)
      .set({ status: "qualified", convertedToContactId: contactId })
      .where(eq(leads.id, leadId));

    // 3. Audit trail on both records.
    await db.insert(activities).values([
      {
        entityType: "leads",
        entityId: leadId,
        type: "note",
        body: `Qualified by ${me.name}; converted to contact.`,
        createdBy: me.id,
      },
      {
        entityType: "contacts",
        entityId: contactId,
        type: "note",
        body: `Created from qualified lead by ${me.name}.`,
        createdBy: me.id,
      },
    ]);

    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/contacts");
    return ok({ contactId, alreadyConverted: false });
  } catch (err) {
    if (err instanceof AuthorizationError) return fail(err.message);
    if (err instanceof z.ZodError) return fail("Invalid lead id.");
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "qualifyLead" });
    return fail("Failed to qualify lead.");
  }
}
