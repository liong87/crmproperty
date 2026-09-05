/**
 * One-off: remove the legacy project checklist template, keep the detailed one.
 *
 * Run:  pnpm checklist:fix            (report only — the default)
 *       APPLY=1 pnpm checklist:fix    (make the changes)
 *
 * WHAT WENT WRONG
 *
 * `documentRequirements` has no admin UI, and `instantiateChecklist` copies EVERY row
 * for a pipeline onto each new deal. Two templates ended up in the `project` pipeline:
 * an older generic one (sentence case — the same style still used by `resale`) and the
 * detailed 12-item one in seed-document-checklist-template.ts. Nobody removed the
 * first, so every booking was created with 19 items, five of them the same document
 * under two names:
 *
 *     Booking form            ↔  Booking / Reservation Form
 *     IC or passport copy     ↔  Buyer IC / Passport Copy
 *     Income documents        ↔  Income / Loan Supporting Documents
 *     Loan approval letter    ↔  Loan Approval Letter      (differs only in case)
 *     SPA signed              ↔  Sale and Purchase Agreement (SPA)
 *
 * Two more named a STAGE rather than a document — "Loan application submitted" and
 * "Stamping and legal". Deal progress is what the pipeline stages are for; a paperwork
 * checklist should list things you can attach a file to.
 *
 * "Booking fee receipt" is deliberately NOT in the list below. It was the one row in
 * the legacy set naming a real document the detailed template lacked, so it has been
 * promoted into seed-document-checklist-template.ts instead of deleted — keeping the
 * row also keeps its link to the deal document already created from it.
 *
 * SOFT DELETE, and existing deals are left alone: `deleted_at` on the requirement stops
 * FUTURE deals inheriting it, while checklist items already on a live deal stay put.
 * Removing paperwork from a deal in flight, silently, from a script, is not something
 * this should do — do it on the deal, where somebody can see what is disappearing.
 */
import { maskUrl } from "../lib/load-env";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { documentRequirements, dealDocuments } from "../lib/db/schema";

/**
 * The canonical order, mirroring scripts/seed-document-checklist-template.ts.
 *
 * The seed script only ever INSERTS — it skips any label already present, and never
 * updates it. So "Booking fee receipt", which survived from the legacy set, kept that
 * set's sort order and sat in the wrong place on every new checklist. Resyncing here
 * makes the code the source of truth for the ORDER as well as the membership.
 */
const CANONICAL_ORDER: Record<string, number> = {
  "Booking / Reservation Form": 1,
  "Booking fee receipt": 2,
  "Buyer IC / Passport Copy": 3,
  "Letter of Appointment (Panel Lawyer)": 4,
  "Sales Form": 5,
  "Consent Letter": 6,
  "Income / Loan Supporting Documents": 7,
  "Loan Approval Letter": 8,
  "Sale and Purchase Agreement (SPA)": 9,
  "Change Unit Form": 10,
  "Cancellation Form": 11,
  "BGB Form": 12,
};

const APPLY = (process.env.APPLY ?? "") !== "";

/** Exact labels, case-sensitive — "Loan approval letter" must go, "Loan Approval Letter" must stay. */
const LEGACY_PROJECT_LABELS = [
  "Booking form",
  "IC or passport copy",
  "Income documents",
  "Loan approval letter",
  "SPA signed",
  "Loan application submitted",
  "Stamping and legal",
];

async function main() {
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(`${APPLY ? "" : "[REPORT ONLY] "}Retiring the legacy project checklist template.\n`);

  let found = 0;
  for (const label of LEGACY_PROJECT_LABELS) {
    const rows = await db
      .select({ id: documentRequirements.id })
      .from(documentRequirements)
      .where(
        and(
          eq(documentRequirements.pipeline, "project"),
          eq(documentRequirements.label, label),
          isNull(documentRequirements.deletedAt),
        ),
      );

    if (rows.length === 0) {
      console.log(`  – "${label}" — not present, nothing to do`);
      continue;
    }
    found += rows.length;

    const used = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(dealDocuments)
      .where(and(eq(dealDocuments.requirementId, rows[0]!.id), isNull(dealDocuments.deletedAt)));
    const n = used[0]?.n ?? 0;

    console.log(
      `  ${APPLY ? "removing" : "would remove"} "${label}"` +
        (n > 0 ? `  (${n} existing deal document(s) keep theirs)` : ""),
    );

    if (APPLY) {
      for (const r of rows) {
        await db
          .update(documentRequirements)
          .set({ deletedAt: new Date() })
          .where(eq(documentRequirements.id, r.id));
      }
    }
  }

  // Resync the order of what remains.
  const live = await db
    .select({ id: documentRequirements.id, label: documentRequirements.label, sortOrder: documentRequirements.sortOrder })
    .from(documentRequirements)
    .where(and(eq(documentRequirements.pipeline, "project"), isNull(documentRequirements.deletedAt)));

  const misordered = live.filter(
    (r) => CANONICAL_ORDER[r.label] != null && CANONICAL_ORDER[r.label] !== r.sortOrder,
  );
  if (misordered.length > 0) {
    console.log("");
    for (const r of misordered) {
      console.log(
        `  ${APPLY ? "reordering" : "would reorder"} "${r.label}"  ${r.sortOrder} → ${CANONICAL_ORDER[r.label]}`,
      );
      if (APPLY) {
        await db
          .update(documentRequirements)
          .set({ sortOrder: CANONICAL_ORDER[r.label] })
          .where(eq(documentRequirements.id, r.id));
      }
    }
  }

  const remaining = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documentRequirements)
    .where(and(eq(documentRequirements.pipeline, "project"), isNull(documentRequirements.deletedAt)));

  console.log(
    `\n${found} legacy requirement(s) ${APPLY ? "removed" : "found"}. ` +
      `The project template ${APPLY ? "now has" : "would then have"} ` +
      `${(remaining[0]?.n ?? 0) - (APPLY ? 0 : found)} items.`,
  );

  if (!APPLY) {
    console.log("\nNothing was changed. Re-run with APPLY=1 to make it so.");
  } else {
    console.log(
      "\nNext: `pnpm seed:project-checklist` adds \"Booking fee receipt\" to the template\n" +
        "if it is missing. New deals get the clean list; deals already open are untouched.",
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
