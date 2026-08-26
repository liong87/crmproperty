/**
 * Time each query the reports page runs, on its own.
 *
 * `pnpm db:check` proves the CONNECTION is healthy; it says nothing about whether a
 * particular query is slow. This runs the three real queries behind /reports,
 * sequentially and then in parallel, so a slow query and a slow pool look different:
 *
 *   one query slow, parallel ≈ that query   → the query is the problem
 *   all fast alone, parallel much slower    → the pool or connection setup is
 *
 * Read-only. Safe against any database.
 */
import "dotenv/config";
import { eq, isNull, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { getReportData } from "@/server/reports/queries";
import { getFunnel, getFunnelTrend } from "@/server/reports/funnel";

async function time<T>(label: string, fn: () => Promise<T>): Promise<void> {
  const t0 = Date.now();
  try {
    const r = await fn();
    const n = Array.isArray(r) ? ` (${r.length} rows)` : "";
    console.log(`  ${label.padEnd(38)} ${String(Date.now() - t0).padStart(7)} ms${n}`);
  } catch (err) {
    console.log(`  ${label.padEnd(38)} FAILED after ${Date.now() - t0} ms`);
    console.log(`    ${(err as Error).message}`);
  }
}

async function main() {
  const [me] = await db
    .select()
    .from(users)
    .where(and(isNull(users.deletedAt), eq(users.active, true)))
    .orderBy(desc(users.role))
    .limit(1);

  if (!me) {
    console.log("No active user in the database — nothing to run the queries as.");
    process.exit(1);
  }
  console.log(`Running as: ${me.name} (${me.role})\n`);

  console.log("Sequential");
  await time("getReportData", () => getReportData(me));
  await time("getFunnel", () => getFunnel(me));
  await time("getFunnelTrend (8 weeks)", () => getFunnelTrend(me, 8));

  console.log("\nParallel (as the page actually runs them)");
  const t0 = Date.now();
  await Promise.all([getReportData(me), getFunnel(me), getFunnelTrend(me, 8)]);
  console.log(`  all three together                     ${String(Date.now() - t0).padStart(7)} ms`);

  process.exit(0);
}

main();
