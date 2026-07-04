/**
 * PDPA retention: hard-delete UNCONVERTED leads older than 24 months, plus their
 * activities, documents (and storage objects), and message logs.
 * Converted leads are kept (they belong to an active contact relationship).
 *
 * Run manually:  pnpm purge:leads
 * Or via cron (e.g. GitHub Actions monthly).
 */
import "dotenv/config";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "../lib/db/client";
import { leads, activities, documents, messageLog } from "../lib/db/schema";
import { storage } from "../lib/storage";

const RETENTION_MONTHS = 24;

async function main() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
  console.log(`Purging unconverted leads created before ${cutoff.toISOString()}…`);

  const stale = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(lt(leads.createdAt, cutoff), isNull(leads.convertedToContactId)));

  const ids = stale.map((l) => l.id);
  if (ids.length === 0) {
    console.log("Nothing to purge.");
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
