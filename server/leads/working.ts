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
import { and, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { ACTIVE_STATUSES, OPEN_STATUSES, DEAD_STATUSES, APPOINTMENT_STATUSES, statusGroup } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { leads, type User } from "@/lib/db/schema";

/** Activity types that count as touching a client. A note to yourself does not. */
const TOUCH_TYPES = ["call", "whatsapp", "email", "appointment", "viewing"] as const;

/** Most cards anyone will work in a sitting. See the note on the query's limit. */
export const LIST_CAP = 200;

/**
 * `handed-over` is the odd one out and deliberately so: the other three list leads
 * ASSIGNED to you, while this lists leads you handed to a colleague and still hold a
 * setter's claim on. Without it a co-broke disappears the moment you give it away, and
 * "passed-out leads went dark" is the exact complaint the feature exists to answer.
 */
export type WorkingTab = "active" | "inactive" | "appointment" | "handed-over";

export interface WorkingLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  interest: string | null;
  source: string;
  sourceDetail: string | null;
  projectId: string | null;
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
  /** The most recent thread entry, for the collapsed remark cell. */
  latestRemark: string | null;
  latestRemarkAt: Date | null;
  createdAt: Date;
  /** Set only on a lead that was handed over: the agent who sourced it. */
  setterId: string | null;
  setterName: string | null;
  /** Who is working it now. Only interesting when that is not the viewer. */
  ownerId: string | null;
  ownerName: string | null;
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

/** Status lists as SQL tuples, for use inside raw `filter (where ...)` fragments. */
const asTuple = (values: readonly string[]) =>
  sql.raw(`(${values.map((v) => `'${v}'`).join(", ")})`);
const OPEN_OR_APPT = asTuple(ACTIVE_STATUSES);
const DEAD_LIST = asTuple(DEAD_STATUSES);
const APPT_LIST = asTuple(APPOINTMENT_STATUSES);
const LEAD_PROJECT_ID = sql.raw('"leads"."project_id"');

/**
 * Phone search that survives how people actually type numbers.
 *
 * Stored numbers are E.164 (+60178899011). Agents type "017-889 9011", "0178899011"
 * or paste "+60 17-889 9011". A plain ILIKE on the stored string matches none of
 * those, so the search looked broken for the one field it is used on most.
 *
 * Both sides are reduced to digits, and a leading Malaysian 0 is dropped so a local
 * number matches its E.164 form: 0178899011 -> 178899011, which is a suffix of
 * 60178899011.
 */
const phoneClause = (q: string) => {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  const local = digits.replace(/^0+/, "");
  return sql`regexp_replace(${leads.phone}, '\\D', '', 'g') like ${`%${local}%`}`;
};

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

const latestRemarkSql = sql<string | null>`(
  select r.body from lead_remarks r
  where r.lead_id = ${LEAD_ID} and r.deleted_at is null
  order by r.created_at desc limit 1
)`;

const latestRemarkAtSql = sql<Date | null>`(
  select r.created_at from lead_remarks r
  where r.lead_id = ${LEAD_ID} and r.deleted_at is null
  order by r.created_at desc limit 1
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
export interface WorkingLeadFilters {
  /** Matches name, phone, email AND remark bodies — see the note on the EXISTS below. */
  search?: string;
}

export async function listWorkingLeads(
  user: User,
  tab: WorkingTab,
  filters: WorkingLeadFilters = {},
): Promise<WorkingLead[]> {
  const q = filters.search?.trim();
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
      projectId: leads.projectId,
      projectName: sql<string | null>`(
        select p.name from projects p where p.id = ${LEAD_PROJECT_ID}
      )`,
      lastTouchAt: lastTouchSql,
      touchCount: touchCountSql,
      openAppointments: openApptSql,
      latestRemark: latestRemarkSql,
      latestRemarkAt: latestRemarkAtSql,
      setterId: leads.setterId,
      setterName: sql<string | null>`(select u.name from users u where u.id = ${leads.setterId})`,
      ownerId: leads.assignedTo,
      ownerName: sql<string | null>`(select u.name from users u where u.id = ${leads.assignedTo})`,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        /*
         * Ownership flips on the handed-over tab: these are leads somebody ELSE is
         * working, listed for the person who sourced them. `ne` rather than nothing,
         * so a lead handed out and later handed back stops appearing as outstanding.
         */
        tab === "handed-over"
          ? and(eq(leads.setterId, user.id), ne(leads.assignedTo, user.id))
          : eq(leads.assignedTo, user.id),
        tab === "inactive"
          ? inArray(leads.status, DEAD_STATUSES)
          : inArray(leads.status, ACTIVE_STATUSES),
        /*
         * Remark bodies are searched as well as the lead's own fields, because that is
         * how an agent looks somebody up — by what was said on the call, not by
         * remembering how the name was spelled. EXISTS rather than a join, so a lead
         * with twenty remarks still comes back once.
         */
        q
          ? or(
              ilike(leads.name, `%${q}%`),
              ilike(leads.phone, `%${q}%`),
        phoneClause(q),
              phoneClause(q),
              ilike(leads.email, `%${q}%`),
              sql`exists (
                select 1 from lead_remarks r
                where r.lead_id = ${LEAD_ID} and r.deleted_at is null
                  and r.body ilike ${`%${q}%`}
              )`,
            )
          : undefined,
      ),
    )
    // Quietest first: this screen exists to surface what has been left alone, so the
    // lead you touched an hour ago belongs at the bottom. Nulls (never touched) sort
    // first, which is correct — an untouched lead is the most urgent thing here.
    .orderBy(sql`${lastTouchSql} asc nulls first`, desc(leads.createdAt))
    /*
     * Capped. This is a queue worked from the top, and the quietest leads sort first,
     * so the 201st card has never been the one anybody needed. Rendering an unbounded
     * list of client components is how a Worker runs out of CPU.
     */
    .limit(LIST_CAP);

  const now = Date.now();
  const withDerived = rows.map((r) => {
    const since = r.lastTouchAt ? new Date(r.lastTouchAt).getTime() : new Date(r.createdAt).getTime();
    return {
      ...r,
      lastTouchAt: r.lastTouchAt ? new Date(r.lastTouchAt) : null,
      latestRemarkAt: r.latestRemarkAt ? new Date(r.latestRemarkAt) : null,
      dormantDays: Math.max(0, Math.floor((now - since) / 86_400_000)),
    };
  });

  /*
   * A lead belongs on the Appointment tab if EITHER is true: it has a booked
   * appointment, or its status is in the appointment stage group.
   *
   * Both, because they are different facts that the interface calls the same thing.
   * The status "Appointment" is a call outcome — the agent got through and agreed to
   * meet. A row in `appointments` is a diary entry. An agent who has just set a lead to
   * "Appointment" and then finds it under "Active" concludes, reasonably, that the app
   * lost it. Splitting on the diary entry alone was mine and it was wrong.
   */
  const onAppointmentTab = (r: { openAppointments: number; status: string }) =>
    r.openAppointments > 0 || statusGroup(r.status) === "appointment";

  if (tab === "appointment") return withDerived.filter(onAppointmentTab);
  if (tab === "active") return withDerived.filter((r) => !onAppointmentTab(r));
  // handed-over and inactive are already fully described by their where clause.
  return withDerived;
}

export interface TabCounts { active: number; inactive: number; appointment: number; handedOver: number }

export async function countWorkingTabs(
  user: User,
  filters: WorkingLeadFilters = {},
): Promise<TabCounts> {
  /*
   * ONE aggregate query, not three list queries.
   *
   * This previously called listWorkingLeads three times and used nothing but .length
   * — materialising every row, with five correlated subqueries each, three times over,
   * to produce three integers. At 2,000 leads that measured 133ms of pure waste on a
   * page that also runs the real list query. Counting is a job for count().
   */
  const q = filters.search?.trim();
  const searchClause = q
    ? or(
        ilike(leads.name, `%${q}%`),
        ilike(leads.phone, `%${q}%`),
        phoneClause(q),
        ilike(leads.email, `%${q}%`),
        sql`exists (
          select 1 from lead_remarks r
          where r.lead_id = ${LEAD_ID} and r.deleted_at is null
            and r.body ilike ${`%${q}%`}
        )`,
      )
    : undefined;

  /* Must mirror onAppointmentTab exactly, or the tab counts contradict the lists. */
  const booked = sql`(
    exists (
      select 1 from appointments ap
      where ap.lead_id = ${LEAD_ID} and ap.status = 'scheduled' and ap.deleted_at is null
    )
    or ${leads.status} in ${APPT_LIST}
  )`;

  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (
        where ${leads.status} in ${OPEN_OR_APPT} and not ${booked}
      )::int`,
      appointment: sql<number>`count(*) filter (
        where ${leads.status} in ${OPEN_OR_APPT} and ${booked}
      )::int`,
      inactive: sql<number>`count(*) filter (where ${leads.status} in ${DEAD_LIST})::int`,
    })
    .from(leads)
    .where(and(isNull(leads.deletedAt), eq(leads.assignedTo, user.id), searchClause));

  /*
   * Counted separately because its ownership clause is the opposite of the other
   * three — folding it into the same aggregate would mean dropping the assigned_to
   * filter from the whole query and re-adding it to every branch, which is how the
   * three existing counts would quietly start including other people's leads.
   */
  const [handed] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.setterId, user.id),
        ne(leads.assignedTo, user.id),
        inArray(leads.status, ACTIVE_STATUSES),
        searchClause,
      ),
    );

  return {
    active: row?.active ?? 0,
    appointment: row?.appointment ?? 0,
    inactive: row?.inactive ?? 0,
    handedOver: handed?.c ?? 0,
  };
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
      // The maintained column, not a re-derivation. It is written by the remark thread
      // and by logged calls, so this is the same number the agent just moved.
      followed: sql<number>`count(*) filter (where ${leads.lastFollowUpAt} >= ${since}::timestamptz)::int`,
    })
    .from(leads)
    .where(
      and(
        isNull(leads.deletedAt),
        eq(leads.assignedTo, user.id),
        inArray(leads.status, OPEN_STATUSES),
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
        inArray(leads.status, OPEN_STATUSES),
        // Active excludes anything on the Appointment tab, by the same rule the tab
        // itself uses: a booked diary entry OR the "Appointment" call outcome.
        sql`not (
          exists (
            select 1 from appointments ap
            where ap.lead_id = ${LEAD_ID}
              and ap.status = 'scheduled'
              and ap.deleted_at is null
          )
          or ${leads.status} in ${APPT_LIST}
        )`,
      ),
    );
  return row?.n ?? 0;
}
