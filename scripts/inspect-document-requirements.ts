/**
 * Report duplicate paperwork-checklist requirements, and optionally remove them.
 *
 * Run:  pnpm requirements:inspect            (report only — the default)
 *       APPLY=1 pnpm requirements:inspect    (actually delete)
 *
 * WHY THIS EXISTS
 *
 * `documentRequirements` has no management UI: rows arrive from
 * scripts/seed-document-checklist-template.ts, or by hand. `instantiateChecklist`
 * copies EVERY row for a pipeline onto each new deal, so a template that accumulated
 * two overlapping sets gives every booking both — the Inbox showed
 *
 *     Booking / Reservation Form      …and…  Booking form
 *     Buyer IC / Passport Copy        …and…  IC or passport copy
 *     Income / Loan Supporting Docs   …and…  Income documents
 *
 * which is a checklist nobody trusts, because the same document appears twice under
 * two names and finishing it twice is impossible.
 *
 * REPORT-ONLY BY DEFAULT, and destructive only behind APPLY=1. These are live records
 * on real deals: an item wrongly deleted is a document nobody is now chasing. The
 * report prints exactly what would go, so a human decides.
 *
 * WHAT "DUPLICATE" MEANS HERE: this script does NOT guess at synonyms. Two labels that
 * mean the same thing to a person ("Booking form" / "Booking / Reservation Form") are
 * not detectably equal to a program, and deleting on a fuzzy match is how you lose the
 * wrong one. It reports every requirement per pipeline with its usage count and flags
 * exact-duplicate labels; the near-duplicates are listed for you to judge.
 */
import { maskUrl } from "../lib/load-env";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { documentRequirements, dealDocuments } from "../lib/db/schema";

const APPLY = (process.env.APPLY ?? "") !== "";

/** Loose key for spotting near-duplicates: lowercase, alphanumerics only. */
const fuzzy = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}\n`);

  const reqs = await db
    .select({
      id: documentRequirements.id,
      pipeline: documentRequirements.pipeline,
      label: documentRequirements.label,
      sortOrder: documentRequirements.sortOrder,
    })
    .from(documentRequirements)
    .where(isNull(documentRequirements.deletedAt))
    .orderBy(documentRequirements.pipeline, documentRequirements.sortOrder);

  if (reqs.length === 0) {
    console.log("No requirements defined.");
    process.exit(0);
  }

  const byPipeline = new Map<string, typeof reqs>();
  for (const r of reqs) {
    const list = byPipeline.get(r.pipeline) ?? [];
    list.push(r);
    byPipeline.set(r.pipeline, list);
  }

  const exactDupes: typeof reqs = [];

  for (const [pipeline, list] of byPipeline) {
    console.log(`── pipeline: ${pipeline} — ${list.length} requirements`);
    const seenExact = new Set<string>();
    const fuzzyGroups = new Map<string, typeof reqs>();

    for (const r of list) {
      const counted = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(dealDocuments)
        .where(and(eq(dealDocuments.requirementId, r.id), isNull(dealDocuments.deletedAt)));
      const n = counted[0]?.n ?? 0;

      const dupe = seenExact.has(r.label);
      if (dupe) exactDupes.push(r);
      seenExact.add(r.label);

      const g = fuzzyGroups.get(fuzzy(r.label)) ?? [];
      g.push(r);
      fuzzyGroups.set(fuzzy(r.label), g);

      console.log(`   ${dupe ? "DUPLICATE " : "          "}${r.label.padEnd(44)} used on ${n} deal document(s)`);
    }

    const near = [...fuzzyGroups.values()].filter((g) => g.length > 1);
    if (near.length) {
      console.log(`\n   Same label ignoring punctuation and case:`);
      for (const g of near) console.log(`     • ${g.map((x) => `"${x.label}"`).join("  ==  ")}`);
    }
    console.log("");
  }

  console.log(
    "Labels that MEAN the same but read differently are not detected — deleting on a\n" +
      "fuzzy match risks removing the wrong one. Review the list above by eye and remove\n" +
      "the unwanted rows yourself; only exact-duplicate labels are handled here.\n",
  );

  if (exactDupes.length === 0) {
    console.log("No exact-duplicate labels to remove.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log(`${exactDupes.length} exact duplicate(s) found. Re-run with APPLY=1 to soft-delete them.`);
    process.exit(0);
  }

  for (const r of exactDupes) {
    await db
      .update(documentRequirements)
      .set({ deletedAt: new Date() })
      .where(eq(documentRequirements.id, r.id));
    console.log(`Soft-deleted duplicate requirement "${r.label}" (${r.pipeline}).`);
  }
  console.log(
    `\nDone. Existing deals keep the checklist items already created from these rows —\n` +
      `remove those on the deal itself, so somebody sees what is disappearing.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
