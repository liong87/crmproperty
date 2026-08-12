/**
 * PDPA retention: hard-delete UNCONVERTED leads older than 24 months, plus their
 * activities, documents (and storage objects), and message logs.
 * Converted leads are kept (they belong to an active contact relationship).
 *
 * Run manually:  pnpm purge:leads
 * Scheduled by:   .github/workflows/pdpa-purge.yml (1st of each month)
 *
 * Set PURGE_DRY_RUN=1 to report what would be deleted without deleting anything.
 * The retention cutoff is computed in Malaysia time, not the runner's local zone —
 * a GitHub runner is on UTC, which previously moved the boundary by up to a day.
 */
import { maskUrl } from "../lib/load-env";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../lib/db/client";
import { leads, activities, documents, messageLog } from "../lib/db/schema";
import { storage } from "../lib/storage";

const RETENTION_MONTHS = 24;
const DRY_RUN = (process.env.PURGE_DRY_RUN ?? "") !== "";

/**
 * Start of the retention window, anchored to Malaysia time (UTC+8, no daylight
 * saving). Using the process's local zone made the cutoff drift by up to a day
 * depending on where the job ran.
 */
function retentionCutoff(): Date {
  const nowMy = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const y = nowMy.getUTCFullYear();
  const m = nowMy.getUTCMonth() - RETENTION_MONTHS;
  const d = nowMy.getUTCDate();
  // Midnight Malaysia time on the cutoff date == 16:00 UTC the previous day.
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - 8 * 60 * 60 * 1000);
}

async function main() {
  const cutoff = retentionCutoff();
  console.log(`Target: ${maskUrl(process.env.DATABASE_URL)}`);
  console.log(
    `${DRY_RUN ? "[DRY RUN] " : ""}Purging unconverted leads created before ` +
      `${cutoff.toISOString()} (24 months, Malaysia time)…`,
  );

  const stale = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(lt(leads.createdAt, cutoff), isNull(leads.convertedToContactId)));

  const ids = stale.map((l) => l.id);
  if (ids.length === 0) {
    console.log("Nothing to purge.");
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would purge ${ids.length} leads. Nothing was deleted.`);
    process.exit(0);
  }

  const docs = await db
    .select()
    .from(documents)
    .where(and(eq(documents.entityType, "leads"), inArray(documents.entityId, ids)));
  for (const d of docs) {
    try { await storage.delete(d.storageKey); } catch { /* best effort */ }
  }
  if (docs.length) await db.delete(documents).where(inArray(documents.id, docs.map((d) => d.id)));

  await db.delete(activities).where(and(eq(activities.entityType, "leads"), inArray(activities.entityId, ids)));
  await db.delete(messageLog).where(and(eq(messageLog.entityType, "leads"), inArray(messageLog.entityId, ids)));
  await db.delete(leads).where(inArray(leads.id, ids));

  console.log(`Purged ${ids.length} leads and ${docs.length} documents.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
