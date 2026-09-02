/**
 * The project sales funnel.
 *
 *   Leads → Appointments set → Showed up → Booked
 *
 * This is the shape the business actually runs on, and it is deliberately built from
 * leads and appointments rather than from deal stages. A deal is created late, only
 * once something is worth calling a deal; the funnel has to describe what happened to
 * every enquiry, including the many that never became one.
 *
 * Every figure is scoped by the caller's role, using the same ownership rules as the
 * rest of the app: an agent sees their own numbers, a team lead sees the team's.
 */
import { and, count, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, appointments, projects, users, type User } from "@/lib/db/schema";
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
  key: "leads" | "appointments" | "showed-up" | "booked";
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

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/**
 * @param sinceDays window to report over. A funnel with no time bound flatters itself:
 *   last year's leads have had a year to convert and this month's have not.
 */
export async function getFunnel(user: User, sinceDays = 90): Promise<FunnelData> {
  const since = daysAgo(sinceDays);
  const liveLead = and(isNull(leads.deletedAt), gte(leads.createdAt, since), ownershipFilter(user, leads.assignedTo));
  const liveAppt = and(
    isNull(appointments.deletedAt),
    gte(appointments.scheduledAt, since),
    // Setter or closer: an agent's own numbers must include presentations they ran
    // for somebody else's lead.
    ownershipFilterAny(user, [appointments.assignedTo, appointments.closerId]),
  );

  const [
    leadTotals,
    apptTotals,
    leadsByProject,
    apptsByProject,
    leadsByAgent,
    apptsSetByAgent,
    apptsClosedByAgent,
  ] = await Promise.all([
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
  ]);

  const totalLeads = leadTotals[0]?.c ?? 0;
  const t = apptTotals[0] ?? { total: 0, showedUp: 0, noShow: 0, booked: 0 };

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
      count: t.booked,
      conversionFromPrevious: share(t.booked, t.showedUp),
      conversionFromLeads: share(t.booked, totalLeads),
    },
  ];

  return {
    scope: isTeamLeadOrAbove(user) ? "team" : "own",
    sinceDays,
    stages,
    // Denominator is appointments that reached a verdict. Counting still-scheduled ones
    // would make every fresh appointment look like a success and dilute the rate.
    noShowRate: share(t.noShow, t.showedUp + t.noShow),
    byProject: merge(leadsByProject, apptsByProject, NO_PROJECT_LABEL),
    byAgent: isTeamLeadOrAbove(user)
      ? await mergeAgents(leadsByAgent, apptsSetByAgent, apptsClosedByAgent)
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
  const since = daysAgo(weeks * 7);
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
      select to_char(date_trunc('week', ${appointments.scheduledAt} at time zone 'Asia/Kuala_Lumpur'), 'YYYY-MM-DD') as bucket,
             count(*)::int as c,
             count(*) filter (where ${appointments.outcome} = 'booked')::int as booked
      from ${appointments}
      where ${appointments.deletedAt} is null
        and ${appointments.scheduledAt} >= ${sinceIso}::timestamptz
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
