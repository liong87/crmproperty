import { describe, expect, it } from "vitest";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { leads, appointments, users, deals } from "@/lib/db/schema";

/**
 * The same guard as by-source.sql.test.ts, for the funnel.
 *
 * Trap 3 (claude/crm-workers-runtime-traps.md) reached production a THIRD time here.
 * It presented as an intermittent 500 on the dashboard whose log named `leadsByAgent`
 * — a query containing no raw SQL at all. The eight funnel queries run in one
 * `Promise.all` on a single pooled connection, so a statement that fails to serialise
 * can surface its error against a different in-flight query. That is why the accused
 * query looked innocent, and why "the failing query has no raw sql" is not a defence.
 *
 * The rule this enforces: if the SHARED predicate is used by any query carrying raw
 * `sql`, every timestamp bound in it is an ISO string cast to ::timestamptz.
 *
 * No connection is made: postgres.js is lazy and toSQL() never touches the socket.
 */
const db = drizzle(postgres("postgres://user:pass@127.0.0.1:5432/never-connected"));

const from = new Date("2026-06-06T00:00:00Z");
const to = new Date("2026-09-04T23:59:59Z");

/** The predicate exactly as server/reports/funnel.ts builds it. */
const liveAppt = and(
  isNull(appointments.deletedAt),
  sql`${appointments.scheduledAt} >= ${from.toISOString()}::timestamptz`,
  sql`${appointments.scheduledAt} <= ${to.toISOString()}::timestamptz`,
);
const liveLead = and(
  isNull(leads.deletedAt),
  sql`${leads.createdAt} >= ${from.toISOString()}::timestamptz`,
  sql`${leads.createdAt} <= ${to.toISOString()}::timestamptz`,
);

describe("funnel date bounds are never Date parameters", () => {
  it("the per-agent lead count — the query the outage named — sends no Date", () => {
    const q = db
      .select({ id: leads.assignedTo, name: users.name, c: count() })
      .from(leads)
      .leftJoin(users, eq(leads.assignedTo, users.id))
      .where(liveLead)
      .groupBy(leads.assignedTo, users.name)
      .toSQL();
    expect(q.params.some((p) => p instanceof Date)).toBe(false);
    expect(q.sql).toContain("::timestamptz");
  });

  it("the appointment aggregate — raw sql AND a shared date predicate — sends no Date", () => {
    const q = db
      .select({
        total: count(),
        showedUp: sql<number>`count(*) filter (where ${appointments.status} = 'showed-up')::int`,
        booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int`,
      })
      .from(appointments)
      .where(liveAppt)
      .toSQL();
    expect(q.params.some((p) => p instanceof Date)).toBe(false);
  });

  it("the coalesce(closer, setter) grouping sends no Date", () => {
    const q = db
      .select({
        id: sql<string | null>`coalesce(${appointments.closerId}, ${appointments.assignedTo})`,
        booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int`,
      })
      .from(appointments)
      .where(liveAppt)
      .groupBy(sql`coalesce(${appointments.closerId}, ${appointments.assignedTo})`)
      .toSQL();
    expect(q.params.some((p) => p instanceof Date)).toBe(false);
  });

  it("the broken form is still detectable — the trap, demonstrated", () => {
    const bad = db
      .select({ booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int` })
      .from(appointments)
      .where(and(isNull(appointments.deletedAt), sql`${appointments.scheduledAt} >= ${from}`))
      .toSQL();
    expect(bad.params.some((p) => p instanceof Date)).toBe(true);
  });
});

/**
 * Bookings taken outside the appointment flow.
 *
 * Two things must hold, and the second is the one that bit. The predicate carries raw
 * `sql`, so its bounds are ISO strings (trap 3, as above). And its NOT EXISTS has to
 * reach the client by BOTH routes: an appointment booked against a lead keeps
 * `contact_id` null forever — booking converts the lead and gives the deal the new
 * contact without ever rewriting the appointment row — so a contact-only match finds
 * nothing and counts that booking twice, once as an appointment and once as a deal.
 * Verified against real rows: contact-only reported 20 bookings where 19 happened.
 */
const directDeals = and(
  isNull(deals.deletedAt),
  sql`not exists (
    select 1 from ${appointments} a
    left join ${leads} l on l.id = a.lead_id and l.deleted_at is null
    where (a.contact_id = ${deals.contactId} or l.converted_to_contact_id = ${deals.contactId})
      and a.outcome = 'booked'
      and a.deleted_at is null
      and a.scheduled_at >= ${from.toISOString()}::timestamptz
      and a.scheduled_at <= ${to.toISOString()}::timestamptz
  )`,
  sql`${deals.createdAt} >= ${from.toISOString()}::timestamptz`,
  sql`${deals.createdAt} <= ${to.toISOString()}::timestamptz`,
);

describe("appointment-less bookings", () => {
  it("sends no Date", () => {
    const q = db
      .select({ projectId: deals.projectId, agentId: deals.assignedTo, c: count() })
      .from(deals)
      .where(directDeals)
      .groupBy(deals.projectId, deals.assignedTo)
      .toSQL();
    expect(q.params.some((p) => p instanceof Date)).toBe(false);
  });

  it("excludes a booking reached through a converted lead, not just a direct contact", () => {
    const { sql: text } = db.select({ c: count() }).from(deals).where(directDeals).toSQL();
    expect(text).toContain("converted_to_contact_id");
    expect(text).toContain("a.contact_id");
  });
});
