/**
 * Does a FAILED Meta delivery get re-processed when Meta retries it?
 *
 * Before the fix, `claim()` returned null on any unique-conflict and the caller read
 * that as "already handled". So a lead whose first attempt failed (expired token, Graph
 * outage) was counted as a duplicate on every retry and lost — while the code's own
 * comments explained that it was throwing precisely so Meta WOULD retry for 36 hours.
 *
 * This exercises the real `claim()` against real PostgreSQL, because the bug lives in
 * the interaction between `onConflictDoNothing` and the row that is already there.
 *
 *   DATABASE_URL=postgresql://crm:crm@127.0.0.1:5432/pa pnpm tsx scripts/verify-claim-retry.ts
 */
import "../lib/load-env";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db/client";
import { captureEvents } from "../lib/db/schema";
import { claimForTest } from "../server/leads/meta";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(`${pass ? "  ok  " : "  FAIL"}  ${name}${pass ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

const change = (id: string) => ({ leadgen_id: id, page_id: "PAGE1", form_id: "FORM1" }) as never;

async function reset(id: string) {
  await db.delete(captureEvents).where(eq(captureEvents.leadgenId, id));
}

async function statusOf(id: string) {
  const [r] = await db
    .select({ s: captureEvents.status })
    .from(captureEvents)
    .where(eq(captureEvents.leadgenId, id));
  return r?.s ?? null;
}

async function main() {
  console.log("\nclaim() retry semantics — real PostgreSQL\n");

  // 1. First ever delivery is claimed.
  await reset("L1");
  const first = await claimForTest(change("L1"));
  check("a first delivery is claimed", typeof first === "string" && first !== "unrecorded", true);

  // 2. A redelivery of a FINISHED lead is a duplicate.
  for (const done of ["created", "duplicate", "fetched"]) {
    await reset("L2");
    await claimForTest(change("L2"));
    await db.update(captureEvents).set({ status: done }).where(eq(captureEvents.leadgenId, "L2"));
    check(`status "${done}" is treated as a duplicate`, await claimForTest(change("L2")), null);
  }

  // 3. THE BUG: a redelivery after a FAILED attempt must be re-claimed, not dropped.
  await reset("L3");
  const claimed = await claimForTest(change("L3"));
  await db
    .update(captureEvents)
    .set({ status: "failed", error: "token expired" })
    .where(eq(captureEvents.leadgenId, "L3"));
  const retry = await claimForTest(change("L3"));
  check("a failed delivery is re-claimed on retry", retry, claimed);
  check("the row is re-opened as received", await statusOf("L3"), "received");
  const [row] = await db
    .select({ e: captureEvents.error })
    .from(captureEvents)
    .where(eq(captureEvents.leadgenId, "L3"));
  check("the stale error is cleared", row?.e, null);

  // 4. A live "received" row must NOT be re-claimed — that is the concurrent case.
  await reset("L4");
  const c4 = await claimForTest(change("L4"));
  check("a fresh 'received' row is NOT re-claimed", await claimForTest(change("L4")), null);

  // 4b. ...but once stranded past the stale window, it is recoverable.
  await db
    .update(captureEvents)
    .set({ updatedAt: new Date(Date.now() - 10 * 60 * 1000) })
    .where(eq(captureEvents.leadgenId, "L4"));
  check("a stranded 'received' row is re-claimed", await claimForTest(change("L4")), c4);

  // 5. Still exactly one audit row per lead — the retry must not create a second.
  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(captureEvents)
    .where(eq(captureEvents.leadgenId, "L3"));
  check("one audit row per leadgen_id after a retry", counted[0]?.n, 1);

  // 6. Concurrency: four simultaneous first deliveries, exactly one winner.
  await reset("L5");
  const racers = await Promise.all([1, 2, 3, 4].map(() => claimForTest(change("L5"))));
  check("4 concurrent claims produce exactly 1 winner", racers.filter((r) => r !== null).length, 1);

  for (const id of ["L1", "L2", "L3", "L4", "L5"]) await reset(id);

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
