"use server";
/**
 * Lead → Contact conversion (the "Qualify" action).
 *
 * Rules (prompt_crm_v2.md):
 *  - Qualifying creates a contact, copies all person + consent fields.
 *  - Sets leads.converted_to_contact_id and lead status = 'closed'.
 *  - The lead row is never deleted; it becomes read-only (guarded in lead actions).
 *  - Activities on the lead stay on the lead; new activities go on the contact.
 *  - Deals can only be created against contacts.
 *
 * All writes run in a single TRANSACTION. Before the move to postgres-js this was
 * impossible (the Neon HTTP driver has no interactive transactions), and the
 * unguarded read-then-write meant a double-clicked "Qualify" button created TWO
 * contacts for one person - one of them orphaned, and both counted in reporting.
 *
 * The lead is claimed with a conditional UPDATE ... WHERE converted_to_contact_id
 * IS NULL, so if two requests race, exactly one wins and the loser rolls back.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadById } from "./queries";
import { assertCanEditOwned } from "@/server/auth/ownership";
import { convertLeadToContact } from "./convert-internal";

export async function qualifyLead(
  leadId: string,
): Promise<ActionResult<{ contactId: string; alreadyConverted: boolean }>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(leadId);

    const lead = await getLeadById(leadId);
    if (!lead) return fail("Lead not found.");
    await assertCanEditOwned(me, lead.assignedTo);

    /*
     * The transaction itself lives in convert-internal.ts, because BOOKING an
     * appointment converts a lead too and authorises on a different rule — see the
     * long note at the top of that file. This function is now just the Qualify
     * button's authorization decision plus the shared write.
     */
    const outcome = await convertLeadToContact(lead, me, "Qualified");

    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/contacts");
    return ok(outcome);
  } catch (err) {
    // A rolled-back transaction means we lost the conversion race. Return the
    // winner's contact rather than an error - the user's intent was satisfied.
    const raced = await getLeadById(leadId);
    if (raced?.convertedToContactId) {
      return ok({ contactId: raced.convertedToContactId, alreadyConverted: true });
    }
    if (err instanceof AuthorizationError) return fail(err.message);
    if (err instanceof z.ZodError) return fail("Invalid lead id.");
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "qualifyLead" });
    return fail("Failed to qualify lead.");
  }
}
