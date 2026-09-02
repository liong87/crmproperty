/**
 * Working Leads — the daily queue, as distinct from the Master Leads database.
 *
 * The spec's central idea, and the one thing our CRM did not have: two surfaces over
 * the same rows. /leads is the database — everything, sortable, filterable, for
 * looking things up. This is the queue — only what is assigned to me, only what is
 * still workable, ordered by what has gone quiet longest. Same table, different job.
 *
 * DERIVED, NOT DENORMALISED. The spec proposes `last_followup_at`, `followup_count`
 * and `dormant_days` as columns kept fresh by a cron. They are computed here from the
 * activity timeline instead, because at five agents the query cost is nothing and a
 * cached counter has exactly one failure mode — going stale and quietly lying about
 * whether somebody rang a client. If this ever gets slow, the fix is a materialised
 * view, not a column nobody can prove is current.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, type User } from "@/lib/db/schema";

/** Activity types that count as touching a client. A note to yourself does not. */
const TOUCH_TYPES = ["call", "whatsapp", "email", "appointment", "viewing"] as const;

export type WorkingTab = "active" | "inactive" | "appointment";

export interface WorkingLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  interest: string | null;
  source: string;
  sourceDetail: string | null;
  projectName: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  /** Last time anybody actually contacted this person. Null means never. */
  lastTouchAt: Date | null;
  /** How many times. Drives the "3x" badge. */
  touchCount: number;
  /** Whole days since the last touch, or since the lead arrived if never touched. */
  dormantDays: number;
  openAppointments: number;
  createdAt: Date;
}

/**
 * The outer lead id, EXPLICITLY QUALIFIED.
 *
 * This is not fussiness. Interpolating `${leads.id}` renders as the bare `"id"`,
 * because drizzle drops the table prefix when it is unambiguous at the top level of a
 * query. Inside a correlated subquery it is NOT unambiguous: `activities` and
 * `appointments` both have their own `id`, PostgreSQL resolves the unqualified name in
 * the innermost scope first, and the correlation quietly becomes `ap.lead_id = ap.id`
 * — always false. No error, just zeroes.
 *
 * That is the worst kind of bug: the follow-up rate, the dormancy badge and the
 * Appointment tab all returned confident, wrong numbers. Qualifying the reference is
 * the fix; sql.raw is safe here because nothing in it comes from user input.
 */
const LEAD_ID = sql.raw('"leads"."id"');
const LEAD_PROJECT_ID = sql.raw('"leads"."project_id"');

const lastTouchSql = sql<Date | null>`(
  select max(a.occurred_at) from activities a
  where a.entity_type = 'leads' and a.entity_id = ${LEAD_ID}
    and a.deleted_at is null
    and a.type in ('call','whatsapp','email','appointment','viewing')
)`;

const touchCountSql = sql<number>`(
  select count(*)::int from activities a
  where a.entity_type = 'leads' and a.entity_id = ${LEAD_ID}
    and a.deleted_at is null
    and a.type in ('call','whatsapp','email','appointment','viewing')
)`;

const openApptSql = sql<number>`(
  select count(*)::int from appointments ap
  where ap.lead_id = ${LEAD_ID}
    and ap.status = 'scheduled'
    and ap.deleted_at is null
)`;

/**
 * The queue is always MINE. A Team Lead looking at their members' work uses /team and
 * the reports; this screen answers "what do I do next", and a shared answer to that is
 * not an answer.
 */
export async function listWorkingLeads(user: User, tab: WorkingTab): Promise<WorkingLead[]> {
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      status: leads.status,
      interest: leads.interest,
      source: leads.source,
      sourceDetail: leads.sourceDetail,
      budgetMin: leads.budgetMin,
      budgetMax: leads.budgetMax,
      createdAt: leads.createdAt,
      projectName: sql<string | null>`(
        select p.name from projects p where p.id = ${LEAD_PROJECT_ID}
      )`,
      lastTouchAt: lastTouchSql,
      touchCount: touchCountSql,
      openAppointments: openApptSql,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.assignedTo, user.id),
        tab === "inactive"
          ? eq(leads.status, "disqualified")
          : inArray(leads.status, ["new", "contacted", "qualified"]),
      ),
    )
    // Quietest first: this screen exists to surface what has been left alone, so the
    // lead you touched an hour ago belongs at the bottom. Nulls (never touched) sort
    // first, which is correct — an untouched lead is the most urgent thing here.
    .orderBy(sql`${lastTouchSql} asc nulls first`, desc(leads.createdAt));

  const now = Date.now();
  const withDerived = rows.map((r) => {
    const since = r.lastTouchAt ? new Date(r.lastTouchAt).getTime() : new Date(r.createdAt).getTime();
    return {
      ...r,
      lastTouchAt: r.lastTouchAt ? new Date(r.lastTouchAt) : null,
      dormantDays: Math.max(0, Math.floor((now - since) / 86_400_000)),
    };
  });

  // The appointment split is on a derived count, so it happens after the query rather
  // than as a third branch of the WHERE.
  if (tab === "appointment") return withDerived.filter((r) => r.openAppointments > 0);
  if (tab === "active") return withDerived.filter((r) => r.openAppointments === 0);
  return withDerived;
}

export interface TabCounts { active: number; inactive: number; appointment: number }

export async function countWorkingTabs(user: User): Promise<TabCounts> {
  const [live, dead] = await Promise.all([
    listWorkingLeads(user, "active"),
    listWorkingLeads(user, "inactive"),
  ]);
  const appointment = (await listWorkingLeads(user, "appointment")).length;
  return { active: live.length, inactive: dead.length, appointment };
}

export interface FollowUpRate {
  followed: number;
  total: number;
  /** Null when there is nothing assigned — 0% would read as failure rather than "none". */
  pct: number | null;
  days: number;
}

/**
 * "Did I touch my leads this week?"
 *
 * The denominator is leads assigned to me that are still workable. Counting
 * disqualified leads would let an agent improve the number by giving up on people,
 * which is precisely the behaviour this metric exists to discourage.
 */
export async function getFollowUpRate(user: User, days = 7): Promise<FollowUpRate> {
  /*
   * ISO string, not a Date, and cast explicitly.
   *
   * Inside a raw `sql` fragment there is no column for drizzle to infer a type from,
   * so a Date is handed to postgres.js unconverted and it throws
   * ERR_INVALID_ARG_TYPE while binding. Anywhere drizzle can see the column — a
   * normal .where(gte(col, date)) — a Date is fine; here it is not.
   */
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      followed: sql<number>`count(*) filter (where ${lastTouchSql} >= ${since}::timestamptz)::int`,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.assignedTo, user.id),
        inArray(leads.status, ["new", "contacted", "qualified"]),
      ),
    );

  const total = row?.total ?? 0;
  const followed = row?.followed ?? 0;
  return { followed, total, pct: total > 0 ? followed / total : null, days };
}

/**
 * Just the Active count, for the sidebar badge.
 *
 * Its own query rather than reusing countWorkingTabs, which runs three full list
 * queries and materialises every row. The sidebar renders on EVERY page, so the badge
 * has to cost one cheap count or it taxes the whole app.
 */
export async function countActiveWorkingLeads(user: User): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.assignedTo, user.id),
        inArray(leads.status, ["new", "contacted", "qualified"]),
        // Active excludes anything already booked in — that lives on the Appointment tab.
        sql`not exists (
          select 1 from appointments ap
          where ap.lead_id = ${LEAD_ID}
            and ap.status = 'scheduled'
            and ap.deleted_at is null
        )`,
      ),
    );
  return row?.n ?? 0;
}
