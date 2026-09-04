/**
 * What happens the moment an appointment is marked BOOKED.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT GAIN A "use server" DIRECTIVE:
 *
 * Every export of a `"use server"` module becomes a browser-callable RPC endpoint as
 * soon as any Client Component imports anything from that module. `openDealForBooking`
 * creates a deal and converts a lead without checking who is asking, because its only
 * caller — `recordAppointmentOutcome` — has already authorised the write. Living beside
 * the actions would make "create a deal against any appointment" an endpoint.
 *
 * WHAT IT FIXES:
 *
 * The project pipeline (Booked → SPA Signed → Loan Approved → Completed), the paperwork
 * checklist with the loan-approval expiry on it, and the commission engine all existed
 * and all sat downstream of a step nobody took. An agent marked an appointment "Booked"
 * on the board and nothing else in the system ever heard about it: no deal, no
 * checklist, no loan to chase, and a funnel whose last column counted bookings as though
 * they were sales.
 *
 * In Malaysian new-launch sales that gap is where the money actually goes. A booking is
 * a deposit and an application, not a completed sale — the bank rejects a meaningful
 * share of them weeks later and the unit comes back. Counting bookings as conversions
 * flatters every report the agency has.
 *
 * So: booking an appointment now OPENS THE DEAL, and the stages that were already built
 * start getting used.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deals, leads, activities, type User } from "@/lib/db/schema";
import { monitoring } from "@/lib/monitoring";
import { convertLeadToContact } from "@/server/leads/convert-internal";
import { openDeal } from "@/server/deals/create-internal";

/** The parts of an appointment this needs. Keeps the caller from passing the whole row. */
export interface BookingSubject {
  id: string;
  contactId: string | null;
  leadId: string | null;
  projectId: string | null;
  propertyId: string | null;
}

export interface BookingResult {
  dealId: string | null;
  /** True when a deal for this client and subject was already open. */
  existing: boolean;
}

/**
 * Ensure there is an open deal for a booked appointment.
 *
 * BEST EFFORT BY DESIGN. A booking that is recorded without its deal is recoverable in
 * one click from the pipeline; a booking that FAILS TO RECORD because deal creation
 * threw is an agent standing in a sales gallery with a signed form and a CRM that will
 * not accept it. The outcome is the fact that matters; the deal is the convenience.
 *
 * IDEMPOTENT. Dragging a card off "Booked" and back on must not open a second deal —
 * the same double-submit shape that already doubles a payout in the commission module.
 */
export async function openDealForBooking(
  subject: BookingSubject,
  me: User,
): Promise<BookingResult> {
  try {
    // 1. A deal requires a contact. An appointment may still be against a lead, because
    //    agents show units to people long before anyone qualifies them. Qualifying is
    //    idempotent and race-safe, and returns the winner's contact either way.
    let contactId = subject.contactId;
    if (!contactId && subject.leadId) {
      const [lead] = await db
        .select()
        .from(leads)
        .where(and(eq(leads.id, subject.leadId), isNull(leads.deletedAt)));
      if (!lead) return { dealId: null, existing: false };
      // No authorization check, on purpose: whoever recorded this booking was already
      // allowed to, and under the setter/closer split they may not own the lead. See
      // the note at the top of convert-internal.ts.
      const converted = await convertLeadToContact(lead, me, "Converted on booking");
      contactId = converted.contactId;
    }
    if (!contactId) return { dealId: null, existing: false };

    // 2. Already open? Match on the client AND the subject, so a client who books two
    //    different projects gets two deals, and a card dragged twice gets one.
    const subjectMatch = subject.projectId
      ? eq(deals.projectId, subject.projectId)
      : subject.propertyId
        ? eq(deals.propertyId, subject.propertyId)
        : null;

    if (subjectMatch) {
      const [open] = await db
        .select({ id: deals.id })
        .from(deals)
        .where(and(eq(deals.contactId, contactId), subjectMatch, isNull(deals.deletedAt)))
        .limit(1);
      if (open) return { dealId: open.id, existing: true };
    }

    // 3. Open it at the first stage of the right pipeline — "Booked" for a project,
    //    which is exactly where a booked appointment belongs. createDeal infers the
    //    pipeline from projectId, picks that stage, and instantiates the paperwork
    //    checklist, so the loan-approval deadline appears without anyone typing it.
    const created = await openDeal(
      {
        contactId,
        projectId: subject.projectId,
        propertyId: subject.propertyId,
        dealType: subject.projectId ? "project" : "resale",
        assignedTo: me.id,
      },
      me,
    );
    if (!created) {
      monitoring.captureMessage("booking: no pipeline stages configured", {
        where: "openDealForBooking",
        appointmentId: subject.id,
      });
      return { dealId: null, existing: false };
    }

    await db.insert(activities).values({
      entityType: "deals",
      entityId: created.id,
      type: "note",
      body: `Opened from a booked appointment by ${me.name}.`,
      createdBy: me.id,
    });

    return { dealId: created.id, existing: false };
  } catch (err) {
    // Swallowed on purpose — see the best-effort note above.
    monitoring.captureException(err, {
      where: "openDealForBooking",
      appointmentId: subject.id,
    });
    return { dealId: null, existing: false };
  }
}
