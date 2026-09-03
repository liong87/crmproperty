/**
 * What do the learning_* tables actually look like right now?
 *
 * Migration 0023 found `learning_topics` and `learning_chapters` already present in
 * production with a different shape, so `CREATE TABLE IF NOT EXISTS` skipped them and
 * the foreign key had no column to attach to. They were never created by a migration —
 * nothing in lib/db/migrations mentions them before 0023 — so they are almost certainly
 * the residue of a `db:push` from an earlier session.
 *
 * READ ONLY. It prints columns and row counts and changes nothing, because the right
 * repair depends entirely on whether those tables hold real data.
 *
 *   pnpm tsx scripts/inspect-learning.ts
 */
// Loads .env.local then .env, the same way every other script here does — tsx does
// not read them on its own, unlike drizzle-kit.
import "../lib/load-env";
import { sql } from "drizzle-orm";
import { db } from "../lib/db/client";

const TABLES = ["learning_topics", "learning_chapters", "learning_attachments", "learning_progress"];

async function main() {
  for (const table of TABLES) {
    const cols = await db.execute(
      sql`select column_name, data_type, is_nullable
          from information_schema.columns
          where table_schema = 'public' and table_name = ${table}
          order by ordinal_position`,
    );

    const rows = Array.isArray(cols) ? cols : (cols as { rows?: unknown[] }).rows ?? [];

    if (rows.length === 0) {
      console.log(`\n${table}: does not exist`);
      continue;
    }

    let count = "?";
    try {
      const c = await db.execute(sql.raw(`select count(*)::int as n from "${table}"`));
      const cRows = Array.isArray(c) ? c : (c as { rows?: unknown[] }).rows ?? [];
      count = String((cRows[0] as { n?: number })?.n ?? "?");
    } catch {
      /* table exists but is unreadable for some reason; columns are still useful */
    }

    console.log(`\n${table}  —  ${count} row(s)`);
    for (const r of rows as { column_name: string; data_type: string; is_nullable: string }[]) {
      console.log(`  ${r.column_name.padEnd(24)} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
