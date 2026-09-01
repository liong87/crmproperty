/**
 * Add one link to EVERY project's sales kit in a single pass.
 *
 * Written for the unit lock sheet, but it is general: any link that belongs on every
 * project — a lock sheet, a commission table, a standard operating procedure — goes in
 * with one command rather than clicking through 20-odd projects.
 *
 * Run:
 *   pnpm tsx scripts/add-kit-link.ts "<label>" "<url>" [category] [--note "..."]
 *
 * Example:
 *   pnpm tsx scripts/add-kit-link.ts "Unit Lock Sheet (live)" "https://docs.google.com/..." price-list \
 *     --note "Internal holds only. Confirm availability with the developer before promising a unit."
 *
 * Additive and idempotent: a project that already has an item with this label is
 * skipped, so re-running after adding a new project only touches the new one. Nothing
 * is ever deleted.
 */
import "../lib/load-env";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { projects, projectResources } from "../lib/db/schema";
import { RESOURCE_CATEGORIES, isResourceCategory } from "../lib/sales-kit";

async function main() {
  const argv = process.argv.slice(2);

  const noteIdx = argv.indexOf("--note");
  const note = noteIdx >= 0 ? argv[noteIdx + 1] ?? null : null;
  const positional = (noteIdx >= 0 ? argv.slice(0, noteIdx) : argv).filter(Boolean);

  const [label, url, category = "price-list"] = positional;

  if (!label || !url) {
    console.error('Usage: pnpm tsx scripts/add-kit-link.ts "<label>" "<url>" [category] [--note "..."]');
    console.error(`Categories: ${RESOURCE_CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  if (!isResourceCategory(category)) {
    console.error(`"${category}" is not a category. Use one of: ${RESOURCE_CATEGORIES.join(", ")}`);
    process.exit(1);
  }

  const all = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(isNull(projects.deletedAt));

  if (all.length === 0) {
    console.error("No projects found.");
    process.exit(1);
  }

  console.log(`Adding "${label}" to ${all.length} project(s) under "${category}"...\n`);

  let added = 0;
  let skipped = 0;

  for (const p of all) {
    const existing = await db
      .select({ id: projectResources.id })
      .from(projectResources)
      .where(
        and(
          eq(projectResources.projectId, p.id),
          eq(projectResources.label, label),
          isNull(projectResources.deletedAt),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  skip  ${p.name} — already has it`);
      skipped++;
      continue;
    }

    // Sort it to the TOP of its category: a lock sheet is checked far more often than
    // a licence, and burying it under the legal documents is how it stops being used.
    const rows = (await db.execute(sql`
      select coalesce(min(sort_order), 1) - 1 as prev
      from project_resources
      where project_id = ${p.id} and category = ${category} and deleted_at is null
    `)) as unknown as Array<{ prev: number | string }>;

    await db.insert(projectResources).values({
      projectId: p.id,
      category,
      label,
      url,
      notes: note,
      sortOrder: Number(rows[0]?.prev ?? 0),
    });

    console.log(`  add   ${p.name}`);
    added++;
  }

  console.log(`\n${added} added, ${skipped} already present.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
