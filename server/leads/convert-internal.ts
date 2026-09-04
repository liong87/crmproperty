/**
 * Lead → Contact conversion, with the authorization decision left to the caller.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT GAIN A "use server" DIRECTIVE:
 *
 * Every export of a `"use server"` module becomes a browser-callable RPC endpoint as
 * soon as any Client Component imports anything from that module. This function
 * converts a lead and writes a contact without asking who is calling, because both of
 * its callers have already decided that question. It belongs in a module with no
 * directive, per the rule this codebase already follows for `remarks-internal.ts` and
 * `checklist-internal.ts`.
 *
 * WHY IT IS SEPARATE FROM `qualifyLead`, WHICH IS THE INTERESTING PART:
 *
 * `qualifyLead` authorises against the LEAD's owner — the right test when an agent
 * presses Qualify on their own lead. But conversion is also triggered by BOOKING an
 * appointment, and appointments authorise against the setter *or the closer*, because
 * the whole product is built around one agent booking and another presenting.
 *
 * Reusing `qualifyLead` there would have meant a closer who just took a deposit on
 * somebody else's client being refused permission to convert them — the booking would
 * record, the deal would silently not open, and nobody would find out until a
 * commission did not appear. The person who booked the unit is, by the act of booking
 * it, entitled to convert the client; that is a different rule from the Qualify button
 * and it deserves to be written down rather than inherited by accident.
 *
 * The transaction below is unchanged from the original and the race note still applies:
 * the lead is claimed with a conditional UPDATE ... WHERE converted_to_contact_id IS
 * NULL, so if two requests race, exactly one wins and the loser rolls back rather than
 * leaving an orphaned contact behind.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, contacts, activities, type Lead, type User } from "@/lib/db/schema";

export interface ConversionOutcome {
  contactId: string;
  alreadyConverted: boolean;
}

/**
 * Convert `lead` into a contact, or return the contact it already became.
 *
 * CALLER MUST HAVE AUTHORISED THE WRITE. There is no check here.
 *
 * @param reason how the conversion came about, for the timeline. Reads as
 *   "Qualified by Aisyah" or "Converted on booking by Aisyah", which is the difference
 *   between a judgement call and a consequence — worth preserving in an audit trail
 *   the product describes as append-only.
 */
export async function convertLeadToContact(
  lead: Lead,
  me: User,
  reason: string,
): Promise<ConversionOutcome> {
  // Fast path: already converted, nothing to do.
  if (lead.convertedToContactId) {
    return { contactId: lead.convertedToContactId, alreadyConverted: true };
  }

  try {
    const contactId = await db.transaction(async (tx) => {
      const [contact] = await tx
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

      const newId = contact!.id;

      // Claim the lead CONDITIONALLY. If another request converted it between our read
      // and now this matches zero rows, and we roll the whole transaction back rather
      // than leave the contact we just inserted orphaned.
      const claimed = await tx
        .update(leads)
        .set({ status: "closed", convertedToContactId: newId })
        .where(and(eq(leads.id, lead.id), isNull(leads.convertedToContactId)))
        .returning({ contactId: leads.convertedToContactId });

      if (claimed.length === 0) tx.rollback();

      await tx.insert(activities).values([
        {
          entityType: "leads",
          entityId: lead.id,
          type: "note",
          body: `${reason} by ${me.name}; converted to contact.`,
          createdBy: me.id,
        },
        {
          entityType: "contacts",
          entityId: newId,
          type: "note",
          body: `Created from lead by ${me.name}.`,
          createdBy: me.id,
        },
      ]);

      return newId;
    });

    return { contactId, alreadyConverted: false };
  } catch (err) {
    /*
     * A rolled-back transaction means we lost the race. The caller's intent — "this
     * lead should be a contact" — is satisfied by the winner, so return the winner
     * rather than an error. Only re-throw if the lead genuinely has no contact, which
     * means the failure was something other than the race.
     */
    const [raced] = await db
      .select({ contactId: leads.convertedToContactId })
      .from(leads)
      .where(eq(leads.id, lead.id));
    if (raced?.contactId) return { contactId: raced.contactId, alreadyConverted: true };
    throw err;
  }
}
