/**
 * Clear the operational records so the CRM can be exercised on a known, small dataset.
 *
 * Run:
 *   pnpm reset:sample            # report only — changes nothing
 *   APPLY=1 pnpm reset:sample    # actually mark the rows deleted
 *
 * On Windows PowerShell the second form is:
 *   $env:APPLY=1; pnpm reset:sample; Remove-Item Env:APPLY
 *
 * SOFT DELETE, NEVER A DROP.
 *
 * Every table in this schema carries `deleted_at` (see `timestamps` in lib/db/schema),
 * and every query in the app filters on it. Setting it is therefore indistinguishable
 * from deletion to anyone using the product, and completely reversible by hand:
 *
 *   update leads set deleted_at = null where deleted_at = '<the timestamp printed>';
 *
 * The whole run shares ONE timestamp for exactly that reason — it is the undo key. A
 * destructive script against a live database has to have a way back, and `delete from`
 * has none.
 *
 * WHAT IS KEPT, AND WHY
 *
 * Records go; CONFIGURATION STAYS. The difference is whether the product can function
 * without it:
 *
 *   - `users` — asked for, and obvious.
 *   - `deal_stages` (+ commission schemes) — Booked / SPA Signed / Loan Approved /
 *     Completed. `openDeal` picks the first stage of the matching pipeline, so a
 *     database with no stages cannot create a deal at all: bookings would silently
 *     stop opening deals, which is the exact bug the booking flow was built to fix.
 *   - `document_requirements` — the 12-item paperwork template a deal is built from.
 *     Wiping it gives you deals with empty checklists and an Inbox with nothing in it.
 *   - `message_templates`, learning content — reusable content, cheap to keep, tedious
 *     to retype.
 *   - Facebook lead capture (`capture_accounts`, `connected_pages`, `lead_form_sources`
 *     and their events) — explicitly kept: clearing it means reconnecting Facebook and
 *     re-mapping every form before campaign leads flow again.
 *
 * ORDER DOES NOT MATTER because nothing is really being removed — no foreign key is
 * ever violated by a soft delete. Children are marked anyway rather than left orphaned,
 * so a restored parent comes back with its history intact.
 */
import { maskUrl } from "../lib/load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

const APPLY = (process.env.APPLY ?? "") !== "";

/**
 * One timestamp for the entire run — see the note above: this is the undo key.
 *
 * An ISO STRING cast to ::timestamptz, not a Date. This is trap 3 from
 * claude/crm-workers-runtime-traps.md and it failed here on the first real run:
 * drizzle infers a parameter's type from the column it is compared against, and raw
 * `sql` has no column to infer from, so postgres-js is handed a Date it cannot
 * serialise. Caught only because the script was actually executed, not merely
 * type-checked.
 */
const STAMP = new Date().toISOString();

/**
 * Physical table names rather than the drizzle objects, and addressed with
 * `sql.identifier`.
 *
 * A generic helper over twenty different table types fought the schema's types the
 * whole way and needed a cast at every line — and a cast is exactly what you do not
 * want between you and an UPDATE on a live database. These names are literals in this
 * file, never user input, and `sql.identifier` quotes them properly.
 *
 * Ordered parent-first, purely so the printed report reads like the thing being
 * cleared rather than a list of tables.
 */
const TABLES = [
  "leads",
  "lead_remarks",
  "lead_assignments",
  "contacts",
  "appointments",
  "deals",
  "deal_documents",
  "deal_commissions",
  "deal_commission_stages",
  "deal_commission_splits",
  "activities",
  "documents",
  "message_log",
  "notifications",
  "projects",
  "project_unit_types",
  "project_resources",
  "project_pool_members",
  "properties",
  "campaign_spend",
] as const;

async function main() {
  console.log(`Database: ${maskUrl(process.env.DATABASE_URL ?? "")}`);
  console.log(
    APPLY
      ? "MODE: APPLY — rows will be marked deleted\n"
      : "MODE: report only — nothing will change\n",
  );

  let total = 0;
  for (const table of TABLES) {
    const rows = (await db.execute(
      sql`select count(*)::int as n from ${sql.identifier(table)} where deleted_at is null`,
    )) as unknown as Array<{ n: number }>;
    const n = Number(rows[0]?.n ?? 0);

    if (n > 0 && APPLY) {
      await db.execute(
        sql`update ${sql.identifier(table)} set deleted_at = ${STAMP}::timestamptz where deleted_at is null`,
      );
    }

    total += n;
    console.log(`  ${String(n).padStart(5)}  ${table}`);
  }

  console.log(`\n  ${String(total).padStart(5)}  rows in total`);

  if (!APPLY) {
    console.log("\nNothing was changed. Re-run with APPLY=1 to clear these.");
    return;
  }

  console.log(`\nCleared at ${STAMP}`);
  console.log("To undo, for any table above:");
  console.log(
    `  update <table> set deleted_at = null where deleted_at = '${STAMP}';`,
  );
  console.log("\nKept: users, deal stages, commission schemes, document requirements,");
  console.log("      message templates, learning content, Facebook lead capture setup.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
