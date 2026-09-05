/**
 * PDPA retention: hard-delete notifications older than 90 days.
 *
 * Run manually:  pnpm purge:notifications
 * Scheduled by:   .github/workflows/pdpa-purge.yml (1st of each month)
 *
 * Set PURGE_DRY_RUN=1 to report what would be deleted without deleting anything.
 *
 * WHY THIS EXISTS
 *
 * Notification bodies carry client names — `server/notifications/jobs.ts` builds them
 * as `${contactName} · ${projectName}`. The lead purge hard-deletes leads, activities,
 * documents and message logs after 24 months, but nothing touched `notifications`, so
 * a client's name could outlive the lead it came from. The retention obligation was
 * being met everywhere except the one table nobody thought of as personal data.
 *
 * NINETY DAYS, not the 24 months leads get. A notification is a record that something
 * already visible elsewhere happened — a lead was passed on, paperwork fell due, an
 * appointment is tomorrow. Three months is well past any operational use, and the
 * underlying facts remain in leads, deals and appointments, which have their own
 * retention. Shorter retention on derived data is the correct shape.
 *
 * Deletes by `created_at` regardless of read state: an unread 90-day-old notification
 * is not going to be read now, and keeping it would defeat the purpose.
 */
import { maskUrl } from "../lib/load-env";
import { lt } from "drizzle-orm";
import { db } from "../lib/db/client";
import { notifications } from "../lib/db/schema";

const RETENTION_DAYS = 90;
const DRY_RUN = (process.env.PURGE_DRY_RUN ?? "") !== "";

/**
 * Start of the retention window, anchored to Malaysia time (UTC+8, no daylight
 * saving) — the same anchoring as the lead purge, and for the same reason: a GitHub
 * runner is on UTC, which moved the boundary by up to a day.
 */
function retentionCutoff(): Date {
  const nowMy = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = nowMy.getUTCFullYear();
  const m = nowMy.getUTCMonth();
  const d = nowMy.getUTCDate() - RETENTION_DAYS;
  // Midnight Malaysia time on the cutoff date == 16:00 UTC the previous day.
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

async function main() {
  const cutoff = retentionCutoff();
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Purging notifications created before ` +
      `${cutoff.toISOString()} (${RETENTION_DAYS} days, Malaysia time)…`,
  );

  const stale = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(lt(notifications.createdAt, cutoff));

  if (stale.length === 0) {
    console.log("Nothing to purge.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would purge ${stale.length} notifications. Nothing was deleted.`);
    process.exit(0);
  }

  await db.delete(notifications).where(lt(notifications.createdAt, cutoff));
  console.log(`Purged ${stale.length} notifications.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
