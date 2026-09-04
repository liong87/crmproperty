/**
 * Does the "Handed over" tab list the right leads for the right person?
 *
 * The risk it guards is specific: every other tab on that screen filters on
 * `assigned_to = me`, and this one inverts that — leads somebody ELSE is working, shown
 * to the person who sourced them. An inverted ownership clause is exactly the shape of
 * mistake that quietly shows an agent a colleague's pipeline, and no test of the
 * arithmetic would catch it.
 *
 * Run against real PostgreSQL because the clause is SQL, not TypeScript.
 *
 *   DB_SSL=disable DATABASE_URL=postgresql://crm:crm@127.0.0.1:5432/booking \
 *     pnpm tsx scripts/verify-handed-over-tab.ts
 */
import "../lib/load-env";
import { eq, inArray } from "drizzle-orm";
import { db } from "../lib/db/client";
import { leads, users, type User } from "../lib/db/schema";
import { listWorkingLeads, countWorkingTabs } from "../server/leads/working";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "  FAIL"}  ${name}` +
      (pass ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const STAMP = Date.now();
const PHONES = [`+6011${STAMP % 10000000}`, `+6012${STAMP % 10000000}`, `+6013${STAMP % 10000000}`];

async function main() {
  console.log("\nhanded-over tab — real PostgreSQL\n");

  const mk = async (tag: string, role: string) =>
    (
      await db
        .insert(users)
        .values({
          externalAuthId: `verify-handed-${tag}-${STAMP}`,
          name: `${tag} ${STAMP}`,
          email: `${tag}-${STAMP}@example.test`,
          role,
          active: true,
        })
        .returning()
    )[0] as User;

  const aisyah = await mk("aisyah", "agent"); // sourced it
  const weiming = await mk("weiming", "agent"); // works it now
  const ravi = await mk("ravi", "agent"); // nothing to do with it

  await db.insert(leads).values([
    // Handed from Aisyah to Wei Ming.
    { name: "Handed", phone: PHONES[0]!, source: "manual", assignedTo: weiming.id, setterId: aisyah.id, status: "new" },
    // Aisyah's own, never handed over.
    { name: "Kept", phone: PHONES[1]!, source: "manual", assignedTo: aisyah.id, status: "new" },
    // Handed out and handed back: setter_id survives, but it is not outstanding.
    { name: "Returned", phone: PHONES[2]!, source: "manual", assignedTo: aisyah.id, setterId: aisyah.id, status: "new" },
  ]);

  const names = async (u: User, tab: "active" | "handed-over") =>
    (await listWorkingLeads(u, tab)).map((r) => r.name).sort();

  // The giver sees what she handed out — and only that.
  check("the setter sees the lead she handed over", await names(aisyah, "handed-over"), ["Handed"]);
  check("a lead handed back is no longer outstanding", (await names(aisyah, "handed-over")).includes("Returned"), false);

  // The receiver sees it as ordinary work, not on the handed-over tab.
  check("the receiver works it on Active", await names(weiming, "active"), ["Handed"]);
  check("the receiver's handed-over tab is empty", await names(weiming, "handed-over"), []);

  // THE LEAK TEST. An uninvolved agent must see none of it.
  check("an unrelated agent sees nothing on Active", await names(ravi, "active"), []);
  check("an unrelated agent sees nothing handed over", await names(ravi, "handed-over"), []);

  // Aisyah's own queue must not include the one she gave away.
  check("the giver's Active queue no longer holds it", await names(aisyah, "active"), ["Kept", "Returned"]);

  // Counts must agree with the lists, or the tab shows a number nobody can reach.
  const aCounts = await countWorkingTabs(aisyah);
  check("the tab count matches the list", aCounts.handedOver, 1);
  check("and the giver's active count is unaffected", aCounts.active, 2);
  check("the receiver has nothing handed over", (await countWorkingTabs(weiming)).handedOver, 0);
  check("an unrelated agent counts zero", (await countWorkingTabs(ravi)).handedOver, 0);

  // Both names travel with the row, or neither side can be told who they share it with.
  const [handed] = await listWorkingLeads(aisyah, "handed-over");
  check("the row names who has it now", handed?.ownerName, weiming.name);
  check("and who the setter is", handed?.setterName, aisyah.name);

  await db.delete(leads).where(inArray(leads.phone, PHONES));
  await db.delete(users).where(inArray(users.id, [aisyah.id, weiming.id, ravi.id]));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
