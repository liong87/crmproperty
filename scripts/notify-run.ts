/**
 * The scheduled notification jobs.
 *
 *   pnpm notify:run                 chase paperwork and remind about appointments
 *   pnpm notify:run digest          the weekly manager summary
 *   NOTIFY_DRY_RUN=1 pnpm notify:run
 *
 * Scheduled by .github/workflows/notifications.yml. Each job is independent: one
 * failing must not stop the others, because a broken digest should not cost somebody
 * their appointment reminder.
 */
import { maskUrl } from "../lib/load-env";
import { chaseDocuments, remindAppointments, weeklyDigest } from "../server/notifications/jobs";

const DRY_RUN = (process.env.NOTIFY_DRY_RUN ?? "") !== "";
const which = process.argv[2] ?? "daily";

async function run(name: string, fn: () => Promise<{ considered: number; notified: number; duplicates: number }>) {
  try {
    const r = await fn();
    console.log(
      `  ${name.padEnd(14)} considered ${r.considered}, notified ${r.notified}, ` +
        `already said ${r.duplicates}`,
    );
  } catch (err) {
    // Reported, not thrown: the next job still deserves its chance.
    console.error(`  ${name.padEnd(14)} FAILED —`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Running ${which} notifications…`);

  if (which === "digest") {
    await run("digest", () => weeklyDigest({ dryRun: DRY_RUN }));
  } else {
    await run("paperwork", () => chaseDocuments({ dryRun: DRY_RUN }));
    await run("appointments", () => remindAppointments({ dryRun: DRY_RUN }));
  }

  console.log("Done.");
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => { console.error(err); process.exit(1); },
);
