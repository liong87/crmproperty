/**
 * Rename the `manager` role to `team_lead`, in data.
 *
 * The code no longer knows the word "manager": Role is "admin" | "team_lead" | "agent",
 * and every permission check compares against those. Rows still holding "manager" would
 * therefore fall through every check and behave as if they had no role at all — a
 * manager who quietly loses the ability to reassign a lead and is told nothing.
 *
 * Kept OUT of the schema migrations on purpose. Drizzle generates DDL from the schema;
 * this is data, and hand-writing a migration to carry it would put a file in
 * lib/db/migrations with no matching snapshot — the exact drift that 0016 was written
 * to repair.
 *
 * Run once, after `pnpm db:migrate` and before (or with) the deploy:
 *
 *     pnpm roles:rename
 *
 * Idempotent: running it again reports zero rows and changes nothing.
 */
import "../lib/load-env";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { users } from "../lib/db/schema";

async function main() {
  const dryRun = process.env.DRY_RUN === "1";

  const stale = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.role, "manager"));

  if (stale.length === 0) {
    console.log("Nothing to do — no rows are still on the 'manager' role.");
    return;
  }

  console.log(`${stale.length} user(s) on the old 'manager' role:`);
  for (const u of stale) console.log(`  ${u.name} <${u.email}>`);

  if (dryRun) {
    console.log("\nDRY_RUN=1 — nothing was changed.");
    return;
  }

  const updated = await db
    .update(users)
    .set({ role: "team_lead" })
    .where(eq(users.role, "manager"))
    .returning({ id: users.id });

  console.log(`\nUpdated ${updated.length} user(s) to 'team_lead'.`);

  // A role the code does not recognise is a silent permission failure, so it is worth
  // one query to prove none is left behind.
  const rogue = await db
    .select({ role: users.role, n: sql<number>`count(*)::int` })
    .from(users)
    .groupBy(users.role);
  const known = new Set(["admin", "team_lead", "agent"]);
  for (const r of rogue) {
    const flag = known.has(r.role) ? " " : " <-- UNKNOWN ROLE";
    console.log(`  ${r.role}: ${r.n}${flag}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
