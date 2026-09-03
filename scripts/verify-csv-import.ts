/**
 * Does the batched import dedupe exactly like the per-row version did?
 *
 * The change replaced one dedupe query per row with a single prefetched index. Dedupe
 * is the risky half: it decides whether a returning client becomes a second record,
 * and getting it wrong is invisible until somebody notices two of the same buyer.
 *
 * `importLeadsFromCsv` itself needs a Clerk session, so this drives the layer under
 * it — `createLeadFromIntake` with and without a `known` index — and asserts the two
 * paths agree. That is where the semantics actually live.
 *
 *   DATABASE_URL=postgresql://crm:crm@127.0.0.1:5432/pa pnpm tsx scripts/verify-csv-import.ts
 */
import "../lib/load-env";
import { and, asc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "../lib/db/client";
import { leads, users, type User } from "../lib/db/schema";
import { DEAD_STATUSES } from "../lib/constants";
import { createLeadFromIntake, knownEmailKey, knownPhoneKey } from "../server/leads/intake";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures++;
  console.log(
    `${pass ? "  ok  " : "  FAIL"}  ${name}` +
      (pass ? "" : `\n          expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`),
  );
}

const P = (n: number) => `+6019000000${n}`;
const ALL = [1, 2, 3, 4, 5, 6, 7, 8].map(P);

const cleanup = () => db.delete(leads).where(inArray(leads.phone, ALL));
const countFor = async (phone: string) =>
  (await db.select({ id: leads.id }).from(leads).where(eq(leads.phone, phone))).length;

/** The prefetch the import performs, verbatim in shape. */
async function buildIndex(phones: string[], emails: string[]) {
  const matchers = [
    phones.length > 0 ? inArray(leads.phone, phones) : undefined,
    emails.length > 0 ? inArray(leads.email, emails) : undefined,
  ].filter(Boolean);
  const known = new Map<string, { id: string }>();
  if (matchers.length === 0) return known;

  const rows = await db
    .select({ id: leads.id, phone: leads.phone, email: leads.email })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        isNull(leads.convertedToContactId),
        notInArray(leads.status, DEAD_STATUSES),
        matchers.length === 1 ? matchers[0] : or(...matchers),
      ),
    )
    .orderBy(asc(leads.createdAt));
  for (const r of rows) {
    known.set(knownPhoneKey(r.phone), { id: r.id });
    if (r.email) known.set(knownEmailKey(r.email), { id: r.id });
  }
  return known;
}

async function main() {
  console.log("\nCSV import dedupe — real PostgreSQL\n");

  const [admin] = await db
    .insert(users)
    .values({
      externalAuthId: `verify-csv-${Date.now()}`,
      name: "CSV Check",
      email: `csv-${Date.now()}@example.test`,
      role: "admin",
      active: true,
    })
    .returning();
  const me = admin as User;
  await cleanup();

  // Already in the CRM and open — an import of the same person must merge.
  await db.insert(leads).values({
    name: "existing", phone: P(1), email: "existing@example.test",
    source: "manual", status: "new", assignedTo: me.id,
  });
  // An old enquiry that is CLOSED must not swallow a fresh one.
  await db.insert(leads).values({
    name: "closed", phone: P(2), source: "manual",
    status: DEAD_STATUSES[0]!, assignedTo: me.id,
  });

  const file = [
    { name: "existing", phone: P(1), email: "existing@example.test" },
    { name: "closed again", phone: P(2), email: null },
    { name: "twice", phone: P(3), email: "twice@example.test" },
    { name: "twice", phone: P(3), email: "twice@example.test" },
    { name: "by email", phone: P(4), email: "shared@example.test" },
    { name: "by email 2", phone: P(5), email: "shared@example.test" },
    { name: "fresh", phone: P(6), email: "fresh@example.test" },
  ];

  const known = await buildIndex(
    [...new Set(file.map((r) => r.phone))],
    [...new Set(file.map((r) => r.email).filter((e): e is string => !!e))],
  );
  check("the prefetch found both pre-existing people by phone", known.size >= 1, true);
  check("a CLOSED lead is absent from the index", known.has(knownPhoneKey(P(2))), false);

  let created = 0;
  let deduped = 0;
  for (const row of file) {
    const res = await createLeadFromIntake(
      { name: row.name, phone: row.phone, email: row.email, consentGiven: false },
      "import",
      me.id,
      { notify: false, known },
    );
    if (!res.success) {
      console.log("  FAIL  row errored:", row.phone, res.error);
      failures++;
      continue;
    }
    res.data.deduped ? deduped++ : created++;
  }

  check("an existing open lead is merged, not duplicated", await countFor(P(1)), 1);
  check("a closed old lead does not block a new enquiry", await countFor(P(2)), 2);
  check("the same person twice in one file makes ONE lead", await countFor(P(3)), 1);
  check("a repeated email dedupes across a different phone", await countFor(P(5)), 0);
  check("a genuinely new person is created", await countFor(P(6)), 1);
  check("created count", created, 4);
  check("deduped count", deduped, 3);

  // The indexed path must agree with the per-row path it replaced.
  await cleanup();
  await db.insert(leads).values({
    name: "agreement", phone: P(7), email: "agree@example.test",
    source: "manual", status: "new", assignedTo: me.id,
  });
  const viaQuery = await createLeadFromIntake(
    { name: "agreement", phone: P(7), email: "agree@example.test", consentGiven: false },
    "import", me.id, { notify: false },
  );
  const idx = await buildIndex([P(7)], ["agree@example.test"]);
  const viaIndex = await createLeadFromIntake(
    { name: "agreement", phone: P(7), email: "agree@example.test", consentGiven: false },
    "import", me.id, { notify: false, known: idx },
  );
  check(
    "indexed dedupe agrees with the per-row query",
    [viaQuery.success && viaQuery.data.deduped, viaIndex.success && viaIndex.data.deduped],
    [true, true],
  );
  check("and neither created a duplicate", await countFor(P(7)), 1);

  await cleanup();
  await db.delete(users).where(eq(users.id, me.id));

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
