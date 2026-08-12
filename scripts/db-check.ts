/**
 * Connection and latency check. Run with: pnpm db:check
 *
 * Times the things a page actually does, so you can tell a slow database from a
 * slow application. Prints no credentials.
 */
import "dotenv/config";
import postgres from "postgres";

function mask(url: string) {
  return url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:****@");
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`  ${label.padEnd(38)} ${String(Date.now() - t0).padStart(6)} ms`);
    return r;
  } catch (e) {
    console.log(`  ${label.padEnd(38)} FAILED after ${Date.now() - t0} ms`);
    throw e;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  console.log("Target:", mask(url));
  const transactionPooler = /:6543(\/|$|\?)/.test(url);
  console.log("Mode:  ", transactionPooler ? "transaction pooler (6543)" : "session/direct");
  console.log();

  const sql = postgres(url, {
    max: 5,
    prepare: transactionPooler ? false : undefined,
    ssl: "require",
    connect_timeout: 30,
    onnotice: () => {},
  });

  console.log("Timings");
  await time("first connection + SELECT 1", () => sql`select 1`);
  await time("second query (connection reused)", () => sql`select 1`);
  await time("third query", () => sql`select 1`);

  const t0 = Date.now();
  await Promise.all(Array.from({ length: 10 }, () => sql`select 1`));
  console.log(`  ${"10 queries in parallel".padEnd(38)} ${String(Date.now() - t0).padStart(6)} ms`);

  const t1 = Date.now();
  for (let i = 0; i < 10; i++) await sql`select 1`;
  console.log(`  ${"10 queries sequentially".padEnd(38)} ${String(Date.now() - t1).padStart(6)} ms`);
  console.log(`  ${"→ per-query round trip".padEnd(38)} ${String(Math.round((Date.now() - t1) / 10)).padStart(6)} ms`);

  console.log();
  console.log("Row counts");
  for (const t of ["users", "leads", "contacts", "properties", "deals", "activities"]) {
    const rows = await sql`select count(*)::int as n from ${sql(t)}`;
    console.log(`  ${t.padEnd(38)} ${String(rows[0]!.n).padStart(6)}`);
  }

  console.log();
  console.log("Migrations applied");
  const migs = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`.catch(() => [{ n: -1 }]);
  console.log(`  drizzle.__drizzle_migrations            ${String(migs[0]!.n).padStart(6)}`);

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
