/**
 * Loads the standard "project" pipeline document checklist -- the paperwork every
 * new-launch / panel-lawyer deal produces, transcribed from the previous agency's
 * TIK1 sales kit and Chia & Lee letter of appointment (see references/).
 *
 * This is a PROCESS template, not project data: it does not create any projects.
 * Projects themselves are added by your team as you take them on, through the
 * app itself -- Projects > New (app/(dashboard)/projects/new) -- so the catalogue
 * stays entirely yours and updates whenever you add a project there, no script
 * needed. Nothing here is Lanthorn- or HOMCO-specific; it's just the checklist
 * shape that repeats across launches.
 *
 * Run: pnpm tsx scripts/seed-document-checklist-template.ts   (requires DATABASE_URL)
 *
 * Additive and idempotent: skips any item (matched by pipeline + label) that
 * already exists. Safe to run against a database that already has real data --
 * it never deletes anything.
 */
import "../lib/load-env";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db/client";
import { documentRequirements } from "../lib/db/schema";

/**
 * The checklist a "project" (new-launch) deal needs, in the order a booking
 * normally produces them. dueAfterDays for the loan-related items follows the
 * letter of appointment's own 2-month (60-day) loan-eligibility deadline --
 * edit these freely, this is meant to be your starting point, not gospel.
 */
const PROJECT_DOCUMENT_CHECKLIST: {
  label: string;
  sortOrder: number;
  required: boolean;
  dueAfterDays: number | null;
  notes: string | null;
}[] = [
  { label: "Booking / Reservation Form", sortOrder: 1, required: true, dueAfterDays: 0, notes: null },
  { label: "Buyer IC / Passport Copy", sortOrder: 2, required: true, dueAfterDays: 3, notes: null },
  {
    label: "Letter of Appointment (Panel Lawyer)",
    sortOrder: 3,
    required: true,
    dueAfterDays: 7,
    notes:
      "RM1,000 advance disbursement to panel lawyer's client account. If the buyer " +
      "cannot obtain a housing loan within 2 months of reservation, the reservation " +
      "is cancelled and RM1,000 is refunded less a RM150 admin fee. Adjust the amounts " +
      "if your panel lawyer's terms differ.",
  },
  { label: "Sales Form", sortOrder: 4, required: true, dueAfterDays: 7, notes: null },
  { label: "Consent Letter", sortOrder: 5, required: true, dueAfterDays: 7, notes: null },
  { label: "Income / Loan Supporting Documents", sortOrder: 6, required: true, dueAfterDays: 14, notes: null },
  {
    label: "Loan Approval Letter",
    sortOrder: 7,
    required: true,
    dueAfterDays: 60,
    notes: "Matches the letter of appointment's 2-month loan eligibility deadline.",
  },
  { label: "Sale and Purchase Agreement (SPA)", sortOrder: 8, required: true, dueAfterDays: 90, notes: null },
  { label: "Change Unit Form", sortOrder: 9, required: false, dueAfterDays: null, notes: "Only if the buyer switches units after booking." },
  { label: "Cancellation Form", sortOrder: 10, required: false, dueAfterDays: null, notes: "Only if the booking is cancelled." },
  { label: "BGB Form", sortOrder: 11, required: false, dueAfterDays: null, notes: null },
];

async function main() {
  console.log("Seeding the project-pipeline document checklist template (additive, non-destructive)...");

  let inserted = 0;
  for (const item of PROJECT_DOCUMENT_CHECKLIST) {
    const existing = await db
      .select({ id: documentRequirements.id })
      .from(documentRequirements)
      .where(and(eq(documentRequirements.pipeline, "project"), eq(documentRequirements.label, item.label)))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(documentRequirements).values({
      pipeline: "project",
      label: item.label,
      sortOrder: item.sortOrder,
      required: item.required,
      dueAfterDays: item.dueAfterDays,
      notes: item.notes,
    });
    inserted++;
  }
  console.log(`  document_requirements: ${inserted} inserted, ${PROJECT_DOCUMENT_CHECKLIST.length - inserted} already present`);
  console.log("Done. Add your own projects via the app: Projects > New.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
