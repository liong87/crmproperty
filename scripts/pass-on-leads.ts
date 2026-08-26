/**
 * Pass stalled PROJECT leads to the next person in the project's pool.
 *
 * Only touches leads attached to a project that has opted in by setting a pass-on
 * window. Resale and unprojected leads are never moved — see server/leads/pass-on.ts.
 *
 * Run manually:  pnpm passon:leads
 * Scheduled by:  .github/workflows/lead-pass-on.yml (every weekday morning)
 *
 * Set PASS_ON_DRY_RUN=1 to report what would move without moving anything.
 */
import { maskUrl } from "../lib/load-env";
import { runPassOn } from "../server/leads/pass-on";

const DRY_RUN = (process.env.PASS_ON_DRY_RUN ?? "") !== "";

async function main() {
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Checking project leads for pass-on…`);

  const r = await runPassOn({ dryRun: DRY_RUN });

  for (const c of r.candidates) {
    const dest = c.toUserId ? `→ next in pool` : "→ nobody to pass to (pool of one)";
    console.log(`  ${c.projectName}: ${c.leadName} idle ${c.idleDays}d ${dest}`);
  }

  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}${r.considered} overdue, ` +
      `${DRY_RUN ? "would move" : "moved"} ${DRY_RUN ? r.candidates.filter((c) => c.toUserId).length : r.moved}, ` +
      `${r.skippedNoOneToPassTo} had nobody to pass to.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
