/**
 * Does /reports actually report the period the user picked?
 *
 * It did not. `resolveRange` produced a correct {from,to}; the page threw both away and
 * passed only `range.days` to each query, which re-derived "N days back from now". So
 * "Last month" chosen on 3 September reported 3 August to 3 September under a heading
 * that said Last month, and a custom January range reported the last 31 days and never
 * touched January.
 *
 * This seeds leads at known dates and asserts each range returns exactly the ones inside
 * it — the check the previous code would have failed.
 *
 *   DATABASE_URL=postgresql://crm:crm@127.0.0.1:5432/pa pnpm tsx scripts/verify-report-window.ts
 */
import "../lib/load-env";
import { inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { leads, users, type User } from "../lib/db/schema";
import { getFunnel } from "../server/reports/funnel";
import { resolveRange } from "../lib/reports/range";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "  FAIL"}  ${name}` +
      (pass ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

// A fixed "now" so the assertions do not drift with the wall clock.
const NOW = new Date("2026-09-03T04:00:00Z"); // noon in Malaysia
const PHONES = ["+60100000001", "+60100000002", "+60100000003", "+60100000004"];

async function main() {
  console.log("\n/reports date window — real PostgreSQL\n");

  const [admin] = await db
    .insert(users)
    .values({
      externalAuthId: `verify-window-${Date.now()}`,
      name: "Window Check",
      email: `window-${Date.now()}@example.test`,
      role: "admin",
      active: true,
    })
    .returning();
  const me = admin as User;

  await db.delete(leads).where(inArray(leads.phone, PHONES));

  // One lead in each period we care about.
  const at = (iso: string, phone: string) => ({
    name: `seed ${phone}`,
    phone,
    assignedTo: me.id,
    source: "manual" as const,
    createdAt: new Date(iso),
  });

  await db.insert(leads).values([
    at("2026-01-15T04:00:00Z", PHONES[0]!), // January — inside a custom Jan range only
    at("2026-08-10T04:00:00Z", PHONES[1]!), // early August — inside "Last month" only
    at("2026-09-01T04:00:00Z", PHONES[2]!), // September — inside "This month"
    at("2026-09-03T03:00:00Z", PHONES[3]!), // today
  ]);

  const countFor = async (params: Record<string, string>) => {
    const r = resolveRange(params, NOW);
    const f = await getFunnel(me, { from: r.from, to: r.to });
    return { label: r.label, leads: f.stages[0]?.count ?? 0 };
  };

  // "Last month" must be August only: the one August lead, and NOT the two September
  // ones. The old code reported 3 Aug – 3 Sep and would have returned 3.
  const lastMonth = await countFor({ range: "last-month" });
  check(`"${lastMonth.label}" counts only August`, lastMonth.leads, 1);

  // "This month" is September: two leads.
  const thisMonth = await countFor({ range: "this-month" });
  check(`"${thisMonth.label}" counts only September`, thisMonth.leads, 2);

  // A custom January range must actually fetch January. The old code turned this into
  // "the last 31 days" and returned the September leads instead.
  const jan = await countFor({ range: "custom", from: "2026-01-01", to: "2026-01-31" });
  check(`"${jan.label}" counts only January`, jan.leads, 1);

  // Last 7 days from 3 Sept reaches back to 28 Aug, so it catches both September leads
  // and neither of the older ones.
  const week = await countFor({ range: "7" });
  check(`"${week.label}" counts both September leads`, week.leads, 2);

  // Maximum spans everything.
  const max = await countFor({ range: "max" });
  check(`"${max.label}" counts all four`, max.leads, 4);

  await db.delete(leads).where(inArray(leads.phone, PHONES));
  await db.delete(users).where(inArray(users.id, [me.id]));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
