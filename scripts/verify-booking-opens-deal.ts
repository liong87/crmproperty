/**
 * Does booking an appointment actually open the deal — once, and for the right person?
 *
 * Before this change it opened nothing. The project pipeline (Booked → SPA Signed →
 * Loan Approved → Completed), the paperwork checklist carrying the loan-approval expiry,
 * and the commission engine all sat downstream of a step nobody took: an agent marked
 * "Booked" on the appointment board and no other part of the system heard about it. The
 * funnel's last column therefore counted deposits as though they were completed sales.
 *
 * These run against real PostgreSQL because every risk here lives in the database
 * rather than in the arithmetic: the conditional claim that makes conversion race-safe,
 * the uniqueness of the deal when a card is dragged twice, and a funnel figure that
 * must key off is_won/is_terminal rather than a stage name a user can rename.
 *
 *   DATABASE_URL=postgresql://crm:crm@127.0.0.1:5432/booking pnpm tsx scripts/verify-booking-opens-deal.ts
 */
import "../lib/load-env";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../lib/db/client";
import {
  contacts,
  deals,
  dealStages,
  leads,
  projects,
  users,
  type User,
} from "../lib/db/schema";
import { openDealForBooking } from "../server/appointments/booking-internal";
import { getFunnel } from "../server/reports/funnel";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "  FAIL"}  ${name}` +
      (pass ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const STAMP = Date.now();
const PHONES = [`+6019${STAMP % 10000000}`, `+6018${STAMP % 10000000}`];

async function main() {
  console.log("\nbooking → deal — real PostgreSQL\n");

  const [setterRow] = await db
    .insert(users)
    .values({
      externalAuthId: `verify-booking-setter-${STAMP}`,
      name: "Setter Check",
      email: `setter-${STAMP}@example.test`,
      role: "agent",
      active: true,
    })
    .returning();
  const [closerRow] = await db
    .insert(users)
    .values({
      externalAuthId: `verify-booking-closer-${STAMP}`,
      name: "Closer Check",
      email: `closer-${STAMP}@example.test`,
      role: "admin",
      active: true,
    })
    .returning();
  const setter = setterRow as User;
  const closer = closerRow as User;

  const [projectA] = await db
    .insert(projects)
    .values({ name: `Verify Tower A ${STAMP}`, state: "Selangor", area: "Verify Area" })
    .returning();
  const [projectB] = await db
    .insert(projects)
    .values({ name: `Verify Tower B ${STAMP}`, state: "Selangor", area: "Verify Area" })
    .returning();

  // A lead owned by the SETTER. The booking below is recorded by the CLOSER, which is
  // the case that would have failed if this reused the Qualify button's rule.
  const [lead] = await db
    .insert(leads)
    .values({
      name: "Booking Check",
      phone: PHONES[0]!,
      source: "manual",
      assignedTo: setter.id,
      status: "appointment",
    })
    .returning();

  const subject = {
    id: "00000000-0000-0000-0000-000000000001",
    contactId: null,
    leadId: lead!.id,
    projectId: projectA!.id,
    propertyId: null,
  };

  // 1. The booking converts the lead and opens a deal.
  const first = await openDealForBooking(subject, closer);
  check("a booking opens a deal", typeof first.dealId === "string", true);
  check("and it is not reported as pre-existing", first.existing, false);

  // 2. The lead became a contact, even though the closer does not own it.
  const [afterLead] = await db
    .select({ contactId: leads.convertedToContactId, status: leads.status })
    .from(leads)
    .where(eq(leads.id, lead!.id));
  check("the lead is converted by a closer who does not own it", typeof afterLead?.contactId === "string", true);
  check("and the lead is closed out", afterLead?.status, "closed");

  // 3. The deal sits at the FIRST project stage — "Booked" — not in the resale pipeline.
  const [opened] = await db
    .select({ stage: dealStages.name, pipeline: dealStages.pipeline, type: deals.dealType })
    .from(deals)
    .innerJoin(dealStages, eq(deals.stageId, dealStages.id))
    .where(eq(deals.id, first.dealId!));
  check("the deal opens at Booked", opened?.stage, "Booked");
  check("in the project pipeline", opened?.pipeline, "project");
  check("as a project deal", opened?.type, "project");

  // 4. THE DOUBLE-DRAG. Marking booked again must not open a second deal — the same
  //    double-submit shape that already doubles a payout in the commission module.
  const second = await openDealForBooking(subject, closer);
  check("a second booking returns the same deal", second.dealId, first.dealId);
  check("and says so", second.existing, true);

  const sameClient = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.contactId, afterLead!.contactId!), isNull(deals.deletedAt)));
  check("exactly one deal exists for the client", sameClient.length, 1);

  // 5. ...but a DIFFERENT project for the same client is a different deal.
  const other = await openDealForBooking({ ...subject, projectId: projectB!.id }, closer);
  check("a second project opens a second deal", other.dealId !== first.dealId, true);
  check("now two deals for the client", (await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.contactId, afterLead!.contactId!), isNull(deals.deletedAt)))).length, 2);

  // 6. THE FUNNEL. Converted must count only deals in a terminal WON stage, so a
  //    booking sitting at the bank is not reported as money earned.
  const window = { from: new Date(Date.now() - 86_400_000), to: new Date(Date.now() + 86_400_000) };
  const stageOf = (f: Awaited<ReturnType<typeof getFunnel>>, key: string) =>
    f.stages.find((s) => s.key === key)?.count ?? -1;

  const before = await getFunnel(closer, window);
  check("two open bookings convert nothing yet", stageOf(before, "converted"), 0);

  const [completed] = await db
    .select({ id: dealStages.id })
    .from(dealStages)
    .where(and(eq(dealStages.pipeline, "project"), eq(dealStages.isWon, true), eq(dealStages.isTerminal, true)));
  await db.update(deals).set({ stageId: completed!.id }).where(eq(deals.id, first.dealId!));

  const after = await getFunnel(closer, window);
  check("completing one deal converts exactly one", stageOf(after, "converted"), 1);

  // A stage renamed in the product must not change the figure — reporting keys off
  // is_won/is_terminal, never the name.
  await db.update(dealStages).set({ name: "Keys Handed Over" }).where(eq(dealStages.id, completed!.id));
  const renamed = await getFunnel(closer, window);
  check("renaming the won stage does not zero conversions", stageOf(renamed, "converted"), 1);
  await db.update(dealStages).set({ name: "Completed" }).where(eq(dealStages.id, completed!.id));

  // ---- clean up ----
  const contactId = afterLead!.contactId!;
  await db.delete(deals).where(eq(deals.contactId, contactId));
  await db.delete(contacts).where(eq(contacts.id, contactId));
  await db.delete(leads).where(inArray(leads.phone, PHONES));
  await db.delete(projects).where(inArray(projects.id, [projectA!.id, projectB!.id]));
  await db.delete(users).where(inArray(users.id, [setter.id, closer.id]));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
