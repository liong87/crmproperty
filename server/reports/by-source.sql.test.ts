import { describe, expect, it, vi } from "vitest";
import { and, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { leads } from "@/lib/db/schema";

/**
 * A guard against a bug that CANNOT be caught by running the query.
 *
 * A JS `Date` passed as a parameter to a statement that also contains raw `sql`
 * fragments throws on Cloudflare Workers: drizzle normally infers the parameter type
 * from the column being compared, and mixing raw SQL into the same statement loses that
 * inference, leaving postgres-js with a Date it cannot serialise.
 *
 * Locally it works. Against real PostgreSQL it works. It fails only in the deployed
 * Worker — which is exactly how it shipped, and why the check has to be on the SHAPE of
 * the query rather than on its result. This asserts no parameter is ever a Date.
 *
 * No connection is made: postgres.js is lazy and toSQL() never touches the socket.
 */
const db = drizzle(postgres("postgres://user:pass@127.0.0.1:5432/never-connected"));

const since = new Date("2026-08-01T00:00:00Z");

describe("timestamp parameters in queries that mix raw SQL", () => {
  it("a Date is what the broken form looks like — the trap, demonstrated", () => {
    const bad = db
      .select({ x: sql<number>`(select 1 from appointments ap where ap.lead_id = ${sql.raw('"leads"."id"')})::int` })
      .from(leads)
      .where(and(isNull(leads.deletedAt), sql`${leads.createdAt} >= ${since}`))
      .toSQL();
    expect(bad.params.some((p) => p instanceof Date)).toBe(true);
  });

  it("the ISO-string cast passes a string instead", () => {
    const good = db
      .select({ x: sql<number>`(select 1 from appointments ap where ap.lead_id = ${sql.raw('"leads"."id"')})::int` })
      .from(leads)
      .where(and(isNull(leads.deletedAt), sql`${leads.createdAt} >= ${since.toISOString()}::timestamptz`))
      .toSQL();
    expect(good.params.some((p) => p instanceof Date)).toBe(false);
    expect(good.sql).toContain("::timestamptz");
  });

  it("getLeadsBySource itself sends no Date parameters", async () => {
    // Renders the REAL query rather than a lookalike: a rewrite that reintroduced a
    // Date would otherwise sail past a test built from a copy of it.
    const captured: unknown[][] = [];
    vi.doMock("@/lib/db/client", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: (w: unknown) => {
              captured.push(db.select().from(leads).where(w as never).toSQL().params);
              return Promise.resolve([]);
            },
          }),
        }),
      },
    }));
    vi.resetModules();
    const { getLeadsBySource } = await import("./by-source");

    await getLeadsBySource({ id: "u1", role: "admin" } as never, { from: new Date(Date.now() - 30 * 86_400_000), to: new Date() });

    expect(captured.length).toBeGreaterThan(0);
    for (const params of captured) {
      expect(params.some((p) => p instanceof Date)).toBe(false);
    }
  });
});
