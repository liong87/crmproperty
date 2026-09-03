import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, appointments } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth/rbac";
import { sourceLabel } from "@/lib/leads/source-label";
import type { User } from "@/lib/db/schema";

/**
 * Leads by source — the question the report could not answer before.
 *
 * Everything else on this page is agent-shaped or stage-shaped. None of it says which
 * CHANNEL produced the deals, which is the one number that decides where next month's
 * budget goes.
 *
 * The nesting is Source → Campaign → Ad set → Ad, taken from the utm columns:
 * `utmCampaign` = campaign, `utmContent` = ad set, `utmTerm` = ad (see the comment on
 * the leads table). Those are names rather than ids, which is fine for reading and is
 * exactly why Brief 7 §15 wants `ctwa_clid` for the cost join later — name matching is
 * good enough to group by, not good enough to bill against.
 */

export interface SourceRow {
  /** Stable key for the row: the raw value, not the label. */
  key: string;
  label: string;
  leads: number;
  appointments: number;
  showedUp: number;
  booked: number;
  converted: number;
  /** Converted / leads. Null when there are no leads, rather than a misleading 0%. */
  conversionRate: number | null;
  children?: SourceRow[];
}

export interface BySourceData {
  scope: "own" | "team";
  rows: SourceRow[];
  /** Leads carrying no source at all — honest about what the table cannot explain. */
  unattributed: number;
  /**
   * Every source present in the window, INCLUDING ones the current filter excludes.
   *
   * Built before filtering on purpose. Deriving the chips from `rows` instead would
   * mean that picking "Meta" leaves Meta as the only chip on screen, with no way back
   * to Google except editing the URL — a filter you cannot un-pick.
   */
  availableSources: { key: string; label: string }[];
}

export interface SourceFilters {
  /** Both ends of the reporting period, resolved once by `resolveRange`. */
  from: Date;
  to: Date;
  /** Restrict to one source, as chosen by the chip row. */
  source?: string | null;
  projectId?: string | null;
}

const rate = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/**
 * ISO string, not a Date, and this is not a style choice.
 *
 * A JS Date passed as a parameter to a query that ALSO contains raw `sql` fragments
 * throws on Cloudflare Workers. Normally drizzle infers the parameter type from the
 * column it is compared against; once raw SQL is mixed into the same statement that
 * inference is lost, and postgres-js is handed a Date it cannot serialise.
 *
 * It fails only in production. Every local run against real PostgreSQL passes, which is
 * exactly how this shipped: the query below is full of correlated subqueries, so it is
 * precisely the shape that breaks. Cast the string instead — see the same fix in
 * server/leads/working.ts.
 */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * One row per lead with its four source levels and its outcomes.
 *
 * Deliberately ONE query with the appointment facts joined on, rather than a query per
 * level. The nesting is then built in memory, which for an agency's monthly volume is
 * far cheaper than four grouped round trips — and this app has already been bitten by
 * a Worker CPU limit for doing the opposite.
 */
export async function getLeadsBySource(user: User, f: SourceFilters): Promise<BySourceData> {
  // ISO strings cast to ::timestamptz, never Date objects: this query contains raw
  // `sql` fragments, and a Date bound alongside raw SQL throws on Workers only. That
  // has caused two production outages. See claude/crm-workers-runtime-traps.md.
  const since = f.from.toISOString();
  const until = f.to.toISOString();

  const where = and(
    isNull(leads.deletedAt),
    sql`${leads.createdAt} >= ${since}::timestamptz`,
    sql`${leads.createdAt} <= ${until}::timestamptz`,
    ownershipFilter(user, leads.assignedTo),
    ...(f.projectId ? [eq(leads.projectId, f.projectId)] : []),
  );

  /*
   * The appointment facts are correlated subqueries rather than a join, because a lead
   * with two appointments would otherwise be counted twice in every column. Note the
   * qualified `"leads"."id"` — an interpolated `${leads.id}` renders WITHOUT its table
   * prefix inside a subquery over `appointments`, which has its own `id`, so PostgreSQL
   * silently binds it to the inner table and every count comes back zero. That bug has
   * already shipped once here; see server/leads/working.sql.test.ts.
   */
  const LEAD_ID = sql.raw('"leads"."id"');

  const rows = await db
    .select({
      source: leads.utmSource,
      sourceDetail: leads.sourceDetail,
      transport: leads.source,
      campaign: leads.utmCampaign,
      adset: leads.utmContent,
      ad: leads.utmTerm,
      status: leads.status,
      hasAppt: sql<number>`(select count(*) from appointments ap
        where ap.lead_id = ${LEAD_ID} and ap.deleted_at is null)::int`,
      showedUp: sql<number>`(select count(*) from appointments ap
        where ap.lead_id = ${LEAD_ID} and ap.deleted_at is null
        and ap.status = 'showed-up')::int`,
      booked: sql<number>`(select count(*) from appointments ap
        where ap.lead_id = ${LEAD_ID} and ap.deleted_at is null
        and ap.outcome = 'booked')::int`,
    })
    .from(leads)
    .where(where);

  const blank = (key: string, label: string): SourceRow => ({
    key,
    label,
    leads: 0,
    appointments: 0,
    showedUp: 0,
    booked: 0,
    converted: 0,
    conversionRate: null,
  });

  const add = (row: SourceRow, r: (typeof rows)[number]) => {
    row.leads += 1;
    if (r.hasAppt > 0) row.appointments += 1;
    if (r.showedUp > 0) row.showedUp += 1;
    if (r.booked > 0) row.booked += 1;
    if (r.status === "closed") row.converted += 1;
  };

  const top = new Map<string, SourceRow>();
  const nested = new Map<string, Map<string, SourceRow>>();
  const available = new Map<string, string>();
  let unattributed = 0;

  for (const r of rows) {
    // Reuses the labelling rule agents already see on a lead, so "meta" here and
    // "Meta" on the lead card are never two different-looking things.
    const label = sourceLabel(r.transport, r.source, r.sourceDetail);
    const key = (r.source ?? r.transport ?? "unknown").toLowerCase();

    if (!r.source && !r.campaign) unattributed += 1;
    available.set(key, label);
    if (f.source && key !== f.source.toLowerCase()) continue;

    const parent = top.get(key) ?? blank(key, label);
    add(parent, r);
    top.set(key, parent);

    // Sub-levels only exist for paid traffic. A walk-in has no campaign, and inventing
    // an "(unknown campaign)" child for it would be noise in every row.
    if (!r.campaign) continue;
    const children = nested.get(key) ?? new Map<string, SourceRow>();
    const childKey = [r.campaign, r.adset, r.ad].filter(Boolean).join(" › ");
    const child = children.get(childKey) ?? blank(childKey, childKey);
    add(child, r);
    children.set(childKey, child);
    nested.set(key, children);
  }

  const finish = (row: SourceRow): SourceRow => ({
    ...row,
    conversionRate: rate(row.converted, row.leads),
  });

  const out = [...top.values()]
    .map((row) => {
      const children = [...(nested.get(row.key)?.values() ?? [])]
        .map(finish)
        .sort((a, b) => b.leads - a.leads);
      return { ...finish(row), ...(children.length > 0 ? { children } : {}) };
    })
    .sort((a, b) => b.leads - a.leads);

  return {
    scope: ownershipFilter(user, leads.assignedTo) === undefined ? "team" : "own",
    rows: out,
    unattributed,
    availableSources: [...available.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export interface FollowUpRow {
  agentId: string;
  name: string;
  /** Open leads assigned to them right now. */
  openLeads: number;
  /** Of those, how many have been touched at least once. */
  touched: number;
  rate: number | null;
}

/**
 * Follow-up rate by agent.
 *
 * On the report rather than only on the working screens because it is the leading
 * indicator: this month's follow-up rate is what next month's appointment count is
 * made of. Every other table here describes what already happened.
 */
export async function getFollowUpByAgent(user: User, openStatuses: readonly string[]): Promise<FollowUpRow[]> {
  const scope = ownershipFilter(user, leads.assignedTo);
  const statuses = sql.raw(`(${openStatuses.map((s) => `'${s}'`).join(", ")})`);

  const rows = await db
    .select({
      agentId: sql<string>`coalesce(u.id::text, '')`,
      name: sql<string>`coalesce(u.name, 'Unassigned')`,
      openLeads: sql<number>`count(*)::int`,
      touched: sql<number>`count(*) filter (where ${leads.followUpCount} > 0)::int`,
    })
    .from(leads)
    .leftJoin(sql`users u`, sql`u.id = ${leads.assignedTo}`)
    .where(and(isNull(leads.deletedAt), sql`${leads.status} in ${statuses}`, scope))
    .groupBy(sql`u.id, u.name`);

  return rows
    .map((r) => ({ ...r, rate: rate(r.touched, r.openLeads) }))
    .sort((a, b) => b.openLeads - a.openLeads);
}
