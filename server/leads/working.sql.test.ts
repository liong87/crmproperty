import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { leads } from "@/lib/db/schema";

/**
 * A guard against a bug that produced no error and no crash — only wrong numbers.
 *
 * Inside a query that already has `leads` in its FROM, drizzle renders an interpolated
 * column WITHOUT its table prefix, because at the top level it is unambiguous. In a
 * correlated subquery over `activities` or `appointments` — both of which have their
 * own `id` — it is not: PostgreSQL resolves the bare name in the INNER scope and the
 * correlation silently becomes `ap.lead_id = ap.id`. Always false.
 *
 * Nothing throws. The follow-up rate, the dormancy badge and the entire Appointment
 * tab simply returned confident, wrong numbers. Note the trap is context-dependent —
 * rendered on its own the same fragment looks correct — which is why this test builds
 * a real query rather than a fragment.
 *
 * No connection is made: postgres.js is lazy and toSQL() never touches the socket.
 */
const db = drizzle(postgres("postgres://user:pass@127.0.0.1:5432/never-connected"));

const emitted = (frag: ReturnType<typeof sql>) =>
  db.select({ x: frag }).from(leads).toSQL().sql;

describe("correlated subquery references", () => {
  it("loses the table prefix when the column is interpolated directly — the trap", () => {
    expect(emitted(sql`(select 1 from appointments ap where ap.lead_id = ${leads.id})`))
      .toContain('ap.lead_id = "id"');
  });

  it("keeps the prefix when written as a qualified raw reference", () => {
    const LEAD_ID = sql.raw('"leads"."id"');
    expect(emitted(sql`(select 1 from appointments ap where ap.lead_id = ${LEAD_ID})`))
      .toContain('ap.lead_id = "leads"."id"');
  });
});
