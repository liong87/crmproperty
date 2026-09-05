/**
 * The project sales funnel.
 *
 *   Leads → Appointments set → Showed up → Booked → Converted
 *
 * The first four stages are built from leads and appointments rather than from deal
 * stages, deliberately: the funnel has to describe what happened to every enquiry,
 * including the many that never became a deal.
 *
 * THE LAST STAGE IS DIFFERENT, AND IT IS THE POINT.
 *
 * A booking is a deposit and a loan application, not a sale. In Malaysian new-launch
 * sales the bank rejects a real share of them weeks later and the unit comes back, so a
 * funnel that ends at Booked reports money the agency has not earned. `Converted` counts
 * the bookings that actually completed — deals that have reached a terminal WON stage —
 * and it is the only figure here that commission should ever be reconciled against.
 *
 * It is counted by WHEN THE BOOKING HAPPENED, not when the deal completed: of the units
 * booked in this period, how many have since gone all the way. That makes the most
 * recent period read low, which is honest — those deals are still at the bank — and it
 * keeps every column of one row describing the same cohort. A conversion figure dated by
 * completion would let a February booking flatter an August report.
 *
 * Every figure is scoped by the caller's role, using the same ownership rules as the
 * rest of the app: an agent sees their own numbers, a team lead sees the team's.
 */
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withDbRetry } from "@/lib/db/retry";
import { leads, appointments, projects, users, deals, dealStages, type User } from "@/lib/db/schema";
import { ownershipFilter, ownershipFilterAny, isTeamLeadOrAbove } from "@/lib/auth";

/**
 * Bucket labels for rows with nothing to group on.
 *
 * Kept distinct and spelled out because "Unassigned" was doing double duty: on the
 * By project table it meant "this lead has no project", which readers took to mean
 * "this lead has no owner" — a different and much more alarming thing.
 */
const NO_PROJECT_LABEL = "No project · resale & rental";
const NO_AGENT_LABEL = "No owner";

export interface FunnelStage {
  key: "leads" | "appointments" | "showed-up" | "booked" | "converted";
  label: string;
  count: number;
  /** Share of the stage above. Null for the first stage, which has nothing above it. */
  conversionFromPrevious: number | null;
  /** Share of the very top of the funnel. */
  conversionFromLeads: number | null;
}

export interface FunnelRow {
  id: string | null;
  label: string;
  leads: number;
  appointments: number;
  showedUp: number;
  booked: number;
  /** Of appointments that reached a verdict, how many were no-shows. Null if none yet. */
  noShowRate: number | null;
}

export interface FunnelData {
  scope: "own" | "team";
  sinceDays: number;
  stages: FunnelStage[];
  /** No-shows as a share of appointments that were either kept or missed. */
  noShowRate: number | null;
  byProject: FunnelRow[];
  /** Empty for agents — the same rule the leaderboard already follows. */
  byAgent: FunnelRow[];
}

const share = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/**
 * The window to report over, as resolved once by `resolveRange` and passed down.
 *
 * It takes BOTH ends. It used to take a day count and re-derive "N days back from now",
 * which silently made every bounded range wrong: choosing "Last month" on 3 September
 * reported 3 August to 3 September while the heading said Last month, and a custom
 * January range reported the last 31 days and never touched January. A range with no
 * upper bound cannot express a period that ended.
 */
export interface ReportWindow {
  from: Date;
  to: Date;
}

/**
 * @param window period to report over. A funnel with no time bound flatters itself:
 *   last year's leads have had a year to convert and this month's have not.
 */
export async function getFunnel(user: User, window: ReportWindow): Promise<FunnelData> {
  const { from, to } = window;

  /*
   * ISO strings cast to ::timestamptz, NOT Date objects — trap 3 in
   * claude/crm-workers-runtime-traps.md, and the third time it has bitten.
   *
   * Drizzle infers a parameter's type from the column it is compared against, and
   * mixing raw `sql` into the same statement loses that inference, leaving postgres-js
   * holding a Date it cannot serialise. Three of the eight queries below carry raw
   * `sql` (`count(*) filter (...)`, `coalesce(...)`) while sharing these predicates,
   * so the bounds have to be strings.
   *
   * It presented as an INTERMITTENT 500 on the dashboard naming an innocent query —
   * `leadsByAgent`, which contains no raw SQL at all. All eight run in one Promise.all
   * on a single pooled connection, and when one statement fails to serialise
   * postgres-js can surface the error against whichever query it happens to be
   * holding. Guarded by server/reports/funnel.sql.test.ts.
   */
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const liveLead = and(
    isNull(leads.deletedAt),
    sql`${leads.createdAt} >= ${fromIso}::timestamptz`,
    sql`${leads.createdAt} <= ${toIso}::timestamptz`,
    ownershipFilter(user, leads.assignedTo),
  );
  /*
   * WINDOWED ON WHEN THE APPOINTMENT WAS SET, NOT WHEN IT HAPPENS.
   *
   * This was `scheduledAt`, and it made the stage disagree with its own label. An agent
   * who books three viewings this morning for next week saw "Appointments set: 0 of 3"
   * all week, because none of those dates had arrived yet — the work was done and the
   * funnel denied it. Worse, by the time they did land in the window, the leads that
   * produced them had often aged out of it, so the row described two different cohorts
   * and the conversion rate between the first two columns was meaningless.
   *
   * Creation date fixes both: every column of one row now describes the same cohort —
   * of what was SET in this period, how much showed up and how much booked — which is
   * the same rule `liveConverted` below already follows for deals.
   */
  const liveAppt = and(
    isNull(appointments.deletedAt),
    sql`${appointments.createdAt} >= ${fromIso}::timestamptz`,
    sql`${appointments.createdAt} <= ${toIso}::timestamptz`,
    // Setter or closer: an agent's own numbers must include presentations they ran
    // for somebody else's lead.
    ownershipFilterAny(user, [appointments.assignedTo, appointments.closerId]),
  );

  /*
   * Deals OPENED in this window that have since reached a terminal won stage.
   *
   * Keyed off `deals.createdAt` because a deal is opened the moment its appointment is
   * booked (see server/appointments/booking-internal.ts), so creation date IS booking
   * date and the cohort matches the four stages above it.
   *
   * `is_won AND is_terminal` rather than the stage NAME: deal_stages is editable in the
   * product, and renaming "Completed" must not silently zero the agency's conversions.
   */
  const liveConverted = and(
    isNull(deals.deletedAt),
    sql`${deals.createdAt} >= ${fromIso}::timestamptz`,
    sql`${deals.createdAt} <= ${toIso}::timestamptz`,
    eq(dealStages.isWon, true),
    eq(dealStages.isTerminal, true),
    ownershipFilter(user, deals.assignedTo),
  );

  /*
   * Deals BOOKED WITHOUT AN APPOINTMENT.
   *
   * The three middle stages are counted from appointments, which is right for a lead
   * that was called, booked in and presented to. But a deal can also be opened straight
   * from the pipeline — a walk-in, a repeat buyer, a booking taken at the gallery and
   * entered afterwards — and those carry no appointment at all. They were invisible
   * here, so a board showing two Booked deals sat next to a funnel reading zero, and
   * the funnel is the screen people distrust first.
   *
   * DOUBLE COUNTING is the whole difficulty. A deal opened by a booked appointment
   * carries no reference back to it — `openDealForBooking` writes an activity note and
   * nothing else — so the test has to be "does this client have a booked appointment in
   * this window at all". If they do, that booking is already counted on the appointment
   * side and the deal must not be counted again.
   *
   * The client is reached BY TWO ROUTES, and missing the second is how this would
   * silently double count. An appointment booked against a LEAD keeps `contact_id`
   * null: booking converts the lead and gives the DEAL the new contact, but never goes
   * back to rewrite the appointment row. So a lead-booked appointment and the deal it
   * created share no column at all — they are joined only through
   * `leads.converted_to_contact_id`. Matching on the contact alone looked correct and
   * counted every one of those bookings twice.
   *
   * Matching on the client rather than on client-plus-subject is the conservative
   * direction otherwise: it can only ever leave a booking out, never invent one.
   *
   * Grouped by project AND owner in one query so the headline, the By project table and
   * the By agent table all move together — three separate counts is how they drift.
   */
  const directDeals = and(
    isNull(deals.deletedAt),
    sql`not exists (
      select 1 from ${appointments} a
      left join ${leads} l on l.id = a.lead_id and l.deleted_at is null
      where (a.contact_id = ${deals.contactId} or l.converted_to_contact_id = ${deals.contactId})
        and a.outcome = 'booked'
        and a.deleted_at is null
        and a.scheduled_at >= ${fromIso}::timestamptz
        and a.scheduled_at <= ${toIso}::timestamptz
    )`,
    sql`${deals.createdAt} >= ${fromIso}::timestamptz`,
    sql`${deals.createdAt} <= ${toIso}::timestamptz`,
    ownershipFilter(user, deals.assignedTo),
  );

  const [
    leadTotals,
    apptTotals,
    convertedTotals,
    leadsByProject,
    apptsByProject,
    leadsByAgent,
    apptsSetByAgent,
    apptsClosedByAgent,
    directBooked,
  ] = await withDbRetry(() => Promise.all([
    db.select({ c: count() }).from(leads).where(liveLead),

    db
      .select({
        total: count(),
        showedUp: sql<number>`count(*) filter (where ${appointments.status} = 'showed-up')::int`,
        noShow: sql<number>`count(*) filter (where ${appointments.status} = 'no-show')::int`,
        booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int`,
      })
      .from(appointments)
      .where(liveAppt),

    db
      .select({ c: count() })
      .from(deals)
      .innerJoin(dealStages, eq(deals.stageId, dealStages.id))
      .where(liveConverted),

    db
      .select({ id: leads.projectId, name: projects.name, c: count() })
      .from(leads)
      .leftJoin(projects, eq(leads.projectId, projects.id))
      .where(liveLead)
      .groupBy(leads.projectId, projects.name),

    db
      .select({
        id: appointments.projectId,
        name: projects.name,
        total: count(),
        showedUp: sql<number>`count(*) filter (where ${appointments.status} = 'showed-up')::int`,
        noShow: sql<number>`count(*) filter (where ${appointments.status} = 'no-show')::int`,
        booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int`,
      })
      .from(appointments)
      .leftJoin(projects, eq(appointments.projectId, projects.id))
      .where(liveAppt)
      .groupBy(appointments.projectId, projects.name),

    db
      .select({ id: leads.assignedTo, name: users.name, c: count() })
      .from(leads)
      .leftJoin(users, eq(leads.assignedTo, users.id))
      .where(liveLead)
      .groupBy(leads.assignedTo, users.name),

    /**
     * Appointments SET, credited to the setter.
     *
     * Split from the closing figures below on purpose. Under a setter/closer model one
     * person books and another may close, so a single per-agent row that mixed the two
     * would credit whoever happened to be in `assignedTo` for work they did not do —
     * and a setter who books excellent appointments and hands them over would appear
     * to have converted nothing.
     */
    db
      .select({ id: appointments.assignedTo, name: users.name, c: count() })
      .from(appointments)
      .leftJoin(users, eq(appointments.assignedTo, users.id))
      .where(liveAppt)
      .groupBy(appointments.assignedTo, users.name),

    /**
     * Outcomes, credited to whoever actually ran the presentation.
     *
     * `coalesce(closer_id, assigned_to)` — when no closer was assigned, the setter
     * closed it themselves and the credit is theirs.
     */
    db
      .select({
        id: sql<string | null>`coalesce(${appointments.closerId}, ${appointments.assignedTo})`,
        showedUp: sql<number>`count(*) filter (where ${appointments.status} = 'showed-up')::int`,
        noShow: sql<number>`count(*) filter (where ${appointments.status} = 'no-show')::int`,
        booked: sql<number>`count(*) filter (where ${appointments.outcome} = 'booked')::int`,
      })
      .from(appointments)
      .where(liveAppt)
      .groupBy(sql`coalesce(${appointments.closerId}, ${appointments.assignedTo})`),

    db
      .select({
        projectId: deals.projectId,
        agentId: deals.assignedTo,
        c: count(),
      })
      .from(deals)
      .where(directDeals)
      .groupBy(deals.projectId, deals.assignedTo),
  ]), "funnel").catch((err: unknown) => {
    /*
     * TEMPORARY DIAGNOSTIC — remove once the intermittent dashboard 500 is named.
     *
     * Drizzle wraps every failure as `Failed query: <sql> params: <...>` and puts the
     * REAL error in `.cause`. Next logs only `.message`, so `wrangler tail` has twice
     * shown us the envelope and never the letter — which is how a serialisation theory
     * survived two rounds of evidence that did not actually support it.
     *
     * postgres-js distinguishes itself here: a PostgresError carries `code` (a
     * SQLSTATE) plus `severity`/`routine`, while a transport failure carries
     * `CONNECT_TIMEOUT`, `CONNECTION_CLOSED` or similar. A Workers isolate violation
     * says "Cannot perform I/O on behalf of a different request". Those three point at
     * three completely different fixes, and nothing above distinguishes them.
     */
    const chain: Record<string, unknown>[] = [];
    let e: unknown = err;
    for (let depth = 0; e && depth < 5; depth++) {
      const o = e as { name?: string; message?: string; code?: unknown; errno?: unknown; severity?: unknown; routine?: unknown; detail?: unknown; cause?: unknown };
      chain.push({
        depth,
        name: o.name,
        message: typeof o.message === "string" ? o.message.slice(0, 300) : undefined,
        code: o.code,
        errno: o.errno,
        severity: o.severity,
        routine: o.routine,
        detail: o.detail,
      });
      e = o.cause;
    }
    console.error("[funnel] query failed — cause chain:", JSON.stringify(chain));
    throw err;
  });

  const totalLeads = leadTotals[0]?.c ?? 0;
  const t = apptTotals[0] ?? { total: 0, showedUp: 0, noShow: 0, booked: 0 };
  const converted = convertedTotals[0]?.c ?? 0;

  /** Bookings taken outside the appointment flow, folded into Booked. */
  const directTotal = directBooked.reduce((n, r) => n + r.c, 0);
  const bookedTotal = t.booked + directTotal;

  const stages: FunnelStage[] = [
    { key: "leads", label: "Leads", count: totalLeads, conversionFromPrevious: null, conversionFromLeads: null },
    {
      key: "appointments",
      label: "Appointments set",
      count: t.total,
      conversionFromPrevious: share(t.total, totalLeads),
      conversionFromLeads: share(t.total, totalLeads),
    },
    {
      key: "showed-up",
      label: "Showed up",
      count: t.showedUp,
      conversionFromPrevious: share(t.showedUp, t.total),
      conversionFromLeads: share(t.showedUp, totalLeads),
    },
    {
      key: "booked",
      label: "Booked",
      count: bookedTotal,
      /*
       * Against Showed up, and it can now exceed 100%.
       *
       * That is not a bug to clamp: a walk-in booking is a real booking with no
       * presentation above it in this funnel. A rate over 100% says "you booked more
       * than you presented to", which is worth seeing rather than hiding.
       */
      conversionFromPrevious: share(bookedTotal, t.showedUp),
      conversionFromLeads: share(bookedTotal, totalLeads),
    },
    {
      key: "converted",
      label: "Converted",
      count: converted,
      // Against Booked, this reads as the survival rate through the bank — the single
      // number that says how much of what the board celebrates turns into commission.
      conversionFromPrevious: share(converted, bookedTotal),
      conversionFromLeads: share(converted, totalLeads),
    },
  ];

  // Derived from the window rather than carried alongside it, so the caption and the
  // figures can never describe different periods.
  const sinceDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));

  return {
    scope: isTeamLeadOrAbove(user) ? "team" : "own",
    sinceDays,
    stages,
    // Denominator is appointments that reached a verdict. Counting still-scheduled ones
    // would make every fresh appointment look like a success and dilute the rate.
    noShowRate: share(t.noShow, t.showedUp + t.noShow),
    byProject: addDirect(
      merge(leadsByProject, apptsByProject, NO_PROJECT_LABEL),
      directBooked.map((r) => ({ id: r.projectId, c: r.c })),
      NO_PROJECT_LABEL,
    ),
    byAgent: isTeamLeadOrAbove(user)
      ? addDirect(
          await mergeAgents(leadsByAgent, apptsSetByAgent, apptsClosedByAgent),
          directBooked.map((r) => ({ id: r.agentId, c: r.c })),
          NO_AGENT_LABEL,
        )
      : [],
  };
}

/**
 * Per-agent rows where the columns mean different things either side of the split:
 * `appointments` is what they SET, `showedUp` and `booked` are what they CLOSED.
 */
async function mergeAgents(
  leadRows: LeadGroup[],
  setRows: Array<{ id: string | null; name: string | null; c: number }>,
  closedRows: Array<{ id: string | null; showedUp: number; noShow: number; booked: number }>,
): Promise<FunnelRow[]> {
  const byId = new Map<string | null, FunnelRow>();
  const ensure = (id: string | null, name?: string | null): FunnelRow => {
    let row = byId.get(id);
    if (!row) {
      row = { id, label: name ?? NO_AGENT_LABEL, leads: 0, appointments: 0, showedUp: 0, booked: 0, noShowRate: null };
      byId.set(id, row);
    }
    if (name && row.label === NO_AGENT_LABEL) row.label = name;
    return row;
  };

  for (const r of leadRows) ensure(r.id, r.name).leads = r.c;
  for (const r of setRows) ensure(r.id, r.name).appointments = r.c;
  for (const r of closedRows) {
    const row = ensure(r.id);
    row.showedUp = r.showedUp;
    row.booked = r.booked;
    row.noShowRate = share(r.noShow, r.showedUp + r.noShow);
  }

  // A closer who set nothing has no name yet — the closer query does not join users,
  // because grouping on a coalesce cannot also carry the joined name reliably.
  const unnamed = [...byId.values()].filter((r) => r.id && r.label === NO_AGENT_LABEL).map((r) => r.id!);
  if (unnamed.length > 0) {
    const names = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unnamed));
    for (const n of names) {
      const row = byId.get(n.id);
      if (row) row.label = n.name;
    }
  }

  return [...byId.values()].sort((a, b) => b.booked - a.booked || b.appointments - a.appointments || b.leads - a.leads);
}


/**
 * Fold appointment-less bookings into rows that were built from appointments.
 *
 * A project or agent can appear here for the first time — somebody whose only activity
 * this period was a walk-in booking has no lead row and no appointment row, and leaving
 * them out would make the table disagree with the headline it sits under.
 *
 * Re-sorted afterwards for the same reason: a row whose booking count just changed
 * cannot keep a position that was ordered on the old number.
 */
function addDirect(
  rows: FunnelRow[],
  direct: Array<{ id: string | null; c: number }>,
  nullLabel: string,
): FunnelRow[] {
  if (direct.length === 0) return rows;
  const byId = new Map<string | null, FunnelRow>(rows.map((r) => [r.id, r]));
  for (const d of direct) {
    const key = d.id ?? null;
    let row = byId.get(key);
    if (!row) {
      row = { id: key, label: nullLabel, leads: 0, appointments: 0, showedUp: 0, booked: 0, noShowRate: null };
      byId.set(key, row);
    }
    row.booked += d.c;
  }
  return [...byId.values()].sort((a, b) => b.booked - a.booked || b.leads - a.leads || b.appointments - a.appointments);
}

type LeadGroup = { id: string | null; name: string | null; c: number };
type ApptGroup = { id: string | null; name: string | null; total: number; showedUp: number; noShow: number; booked: number };

/**
 * Join the two grouped queries in memory.
 *
 * A full outer join in SQL would need both sides to exist; here a project can have
 * leads and no appointments yet (the interesting case — nobody has called them) or
 * appointments and no leads (walk-ins), and both must still appear.
 */
function merge(leadRows: LeadGroup[], apptRows: ApptGroup[], nullLabel: string): FunnelRow[] {
  const byId = new Map<string | null, FunnelRow>();

  const ensure = (id: string | null, name: string | null): FunnelRow => {
    const key = id ?? null;
    let row = byId.get(key);
    if (!row) {
      row = { id: key, label: name ?? nullLabel, leads: 0, appointments: 0, showedUp: 0, booked: 0, noShowRate: null };
      byId.set(key, row);
    }
    if (name && row.label === nullLabel) row.label = name;
    return row;
  };

  for (const r of leadRows) ensure(r.id, r.name).leads = r.c;
  for (const r of apptRows) {
    const row = ensure(r.id, r.name);
    row.appointments = r.total;
    row.showedUp = r.showedUp;
    row.booked = r.booked;
    row.noShowRate = share(r.noShow, r.showedUp + r.noShow);
  }

  return [...byId.values()].sort((a, b) => b.leads - a.leads || b.appointments - a.appointments);
}

/* ---------- trend ---------- */

export interface TrendPoint {
  /** Week start, Malaysia time. */
  weekStart: Date;
  label: string;
  leads: number;
  appointments: number;
  booked: number;
}

/**
 * Weekly counts across the funnel.
 *
 * Counts answer "how many"; only a trend answers "are we getting better", which is
 * the question a principal actually has. Bucketed by week rather than day because a
 * five-person agency's daily numbers are mostly noise.
 *
 * Weeks are cut in MALAYSIA time, not UTC. A lead that arrived at 9am Monday in KL is
 * 1am Monday UTC — but one that arrived at 7am Monday KL is 11pm SUNDAY UTC, and would
 * land in the previous week on a UTC cut. That is an off-by-one nobody would ever
 * notice and everybody would act on.
 */
export async function getFunnelTrend(user: User, weeks = 12): Promise<TrendPoint[]> {
  const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  const own = !isTeamLeadOrAbove(user);
  /**
   * Bound as an ISO STRING with an explicit cast, not as a Date.
   *
   * `db.execute` with a raw sql template hands parameters straight to postgres-js,
   * which cannot serialise a JS Date — unlike the typed query builder, which converts
   * it for you. Passing the Date throws ERR_INVALID_ARG_TYPE at bind time, which is a
   * 500 on every dashboard load rather than a wrong number.
   */
  const sinceIso = since.toISOString();

  const [leadRows, apptRows] = await Promise.all([
    db.execute(sql`
      select to_char(date_trunc('week', ${leads.createdAt} at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as bucket,
             count(*)::int as c
      from ${leads}
      where ${leads.deletedAt} is null
        and ${leads.createdAt} >= ${sinceIso}::timestamptz
        ${own ? sql`and ${leads.assignedTo} = ${user.id}` : sql``}
      group by 1
    `),
    db.execute(sql`
      -- Bucketed on when the appointment was SET, matching the funnel above it. These
      -- two charts sit on one screen and must not disagree about the same week: with
      -- the trend on scheduled_at and the funnel on created_at, a viewing booked today
      -- for next month appeared in a future week here and in this month there.
      select to_char(date_trunc('week', ${appointments.createdAt} at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as bucket,
             count(*)::int as c,
             count(*) filter (where ${appointments.outcome} = 'booked')::int as booked
      from ${appointments}
      where ${appointments.deletedAt} is null
        and ${appointments.createdAt} >= ${sinceIso}::timestamptz
        ${own ? sql`and ${appointments.assignedTo} = ${user.id}` : sql``}
      group by 1
    `),
  ]);

  /*
   * The bucket comes back as a plain 'YYYY-MM-DD' STRING, formatted by postgres,
   * and is used as the map key verbatim — it is never parsed into a Date.
   *
   * `date_trunc(... at time zone ...)` yields a timestamp WITHOUT time zone: Monday
   * midnight in Malaysian wall-clock terms. Handing that to `new Date()` made the
   * driver interpret it in the SERVER's local zone, so on a machine set to UTC+8
   * every bucket shifted back a day, matched nothing on the JS side, and the whole
   * trend rendered as flat zeroes next to a funnel showing real counts. It looked
   * correct anywhere running in UTC, which is exactly why it survived testing.
   */
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const leadBy = new Map<string, number>();
  for (const r of leadRows as unknown as Array<{ bucket: string; c: number }>) {
    leadBy.set(r.bucket, Number(r.c));
  }
  const apptBy = new Map<string, { c: number; booked: number }>();
  for (const r of apptRows as unknown as Array<{ bucket: string; c: number; booked: number }>) {
    apptBy.set(r.bucket, { c: Number(r.c), booked: Number(r.booked) });
  }

  // Build every week in the window, so a quiet week reads as a dip rather than
  // vanishing and making the line lie about the gap.
  const out: TrendPoint[] = [];
  const cursor = startOfWeekMY(since);
  const end = new Date();
  const fmt = new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });

  while (cursor <= end) {
    const k = key(cursor);
    const appt = apptBy.get(k);
    out.push({
      weekStart: new Date(cursor),
      label: fmt.format(cursor),
      leads: leadBy.get(k) ?? 0,
      appointments: appt?.c ?? 0,
      booked: appt?.booked ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return out;
}

/** Monday of the week containing `d`, in Malaysia time, as a UTC-midnight marker. */
function startOfWeekMY(d: Date): Date {
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const dow = (my.getUTCDay() + 6) % 7; // Monday = 0, matching date_trunc('week').
  return new Date(Date.UTC(my.getUTCFullYear(), my.getUTCMonth(), my.getUTCDate() - dow));
}
