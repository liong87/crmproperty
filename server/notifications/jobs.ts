/**
 * The scheduled notification jobs.
 *
 * All three share one shape: find what is true now, say it once, move on. The "once"
 * is the hard part and it is solved in `lib/notify` by a dedupe key naming the FACT
 * rather than the moment — see each job for the key it chooses and why.
 *
 * These deliberately do NOT read the app's RBAC helpers. A scheduled job has no
 * session and is not acting for anybody; it looks at everything and addresses each
 * notification to the person responsible for that record.
 *
 * Run: pnpm notify:run          (all three)
 *      NOTIFY_DRY_RUN=1 ...     report without writing
 */
import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  dealDocuments, deals, contacts, projects, appointments, leads, users,
} from "@/lib/db/schema";
import { notify } from "@/lib/notify";

const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Calendar day number in Malaysia time. Elapsed milliseconds give the wrong answer. */
const myDayNumber = (d: Date): number =>
  Math.floor((d.getTime() + MY_OFFSET_MS) / 86_400_000);

/** YYYY-MM-DD in Malaysia time — used in dedupe keys so "today" means the local day. */
const myDate = (d: Date): string =>
  new Date(d.getTime() + MY_OFFSET_MS).toISOString().slice(0, 10);

export interface JobResult {
  considered: number;
  notified: number;
  duplicates: number;
}

const empty = (): JobResult => ({ considered: 0, notified: 0, duplicates: 0 });

/* ------------------------------------------------------------------ paperwork */

/**
 * Chase checklist items that are due soon or already late.
 *
 * The key is `doc-due:<itemId>:<dueDate>`, so:
 *  - the same item on the same deadline is said once and never again
 *  - moving the deadline is a NEW fact and says it again, which is correct — a date
 *    that changed is exactly when somebody needs telling
 *
 * Overdue items are not re-chased daily. That is a deliberate choice: a daily nag for
 * something already late trains people to ignore the inbox, and the item is already on
 * /reminders and the dashboard in red. The notification exists to catch the thing you
 * had not noticed, not to keep shouting about the thing you had.
 */
export async function chaseDocuments(
  { dryRun = false, withinDays = 5 }: { dryRun?: boolean; withinDays?: number } = {},
): Promise<JobResult> {
  const result = empty();
  const horizon = new Date(Date.now() + withinDays * 86_400_000);

  const rows = await db
    .select({
      itemId: dealDocuments.id,
      label: dealDocuments.label,
      dueAt: dealDocuments.dueAt,
      dealId: deals.id,
      ownerId: deals.assignedTo,
      contactName: contacts.name,
      projectName: projects.name,
    })
    .from(dealDocuments)
    .innerJoin(deals, eq(deals.id, dealDocuments.dealId))
    .innerJoin(contacts, eq(contacts.id, deals.contactId))
    .leftJoin(projects, eq(projects.id, deals.projectId))
    .where(and(
      isNull(dealDocuments.completedAt),
      isNull(dealDocuments.deletedAt),
      isNull(deals.deletedAt),
      lte(dealDocuments.dueAt, horizon),
    ))
    .orderBy(asc(dealDocuments.dueAt));

  const today = myDayNumber(new Date());

  for (const r of rows) {
    if (!r.ownerId || !r.dueAt) continue;
    result.considered++;
    if (dryRun) continue;

    const days = myDayNumber(r.dueAt) - today;
    const when =
      days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
      : days === 0 ? "due today"
      : `due in ${days} day${days === 1 ? "" : "s"}`;

    const res = await notify({
      userId: r.ownerId,
      kind: "document-due",
      title: `${r.label} — ${when}`,
      body: `${r.contactName}${r.projectName ? ` · ${r.projectName}` : ""}`,
      link: `/deals/${r.dealId}`,
      entityType: "deals",
      entityId: r.dealId,
      dedupeKey: `doc-due:${r.itemId}:${myDate(r.dueAt)}`,
    });

    if (res.created) result.notified++;
    else if (res.reason === "duplicate") result.duplicates++;
  }

  return result;
}

/* --------------------------------------------------------------- appointments */

/**
 * Remind whoever is running tomorrow's appointments.
 *
 * Both the setter and the closer are told when they differ — the setter arranged it and
 * will be asked about it; the closer has to turn up. Keyed on the appointment and the
 * DAY, so re-running the job on the same day says nothing new, and rescheduling to a
 * different day legitimately reminds again.
 */
export async function remindAppointments(
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<JobResult> {
  const result = empty();

  // Tomorrow, in Malaysia time, as a UTC range.
  const startDay = myDayNumber(new Date()) + 1;
  const from = new Date(startDay * 86_400_000 - MY_OFFSET_MS);
  const to = new Date((startDay + 1) * 86_400_000 - MY_OFFSET_MS);

  const rows = await db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      assignedTo: appointments.assignedTo,
      closerId: appointments.closerId,
      leadName: leads.name,
      contactName: contacts.name,
      projectName: projects.name,
    })
    .from(appointments)
    .leftJoin(leads, eq(leads.id, appointments.leadId))
    .leftJoin(contacts, eq(contacts.id, appointments.contactId))
    .leftJoin(projects, eq(projects.id, appointments.projectId))
    .where(and(
      eq(appointments.status, "scheduled"),
      isNull(appointments.deletedAt),
      gte(appointments.scheduledAt, from),
      lt(appointments.scheduledAt, to),
    ))
    .orderBy(asc(appointments.scheduledAt));

  for (const r of rows) {
    result.considered++;
    if (dryRun) continue;

    const who = r.contactName ?? r.leadName ?? "a client";
    const time = new Intl.DateTimeFormat("en-MY", {
      hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
    }).format(r.scheduledAt);
    const day = myDate(r.scheduledAt);

    // Setter and closer are usually the same person; a Set stops one being told twice.
    const recipients = new Set([r.assignedTo, r.closerId].filter((x): x is string => !!x));

    for (const userId of recipients) {
      const res = await notify({
        userId,
        kind: "appointment-reminder",
        title: `Tomorrow ${time}: ${who}`,
        body: r.projectName ? `${r.projectName} gallery` : "Viewing",
        link: "/appointments",
        entityType: "appointments",
        entityId: r.id,
        dedupeKey: `appt:${r.id}:${day}`,
      });
      if (res.created) result.notified++;
      else if (res.reason === "duplicate") result.duplicates++;
    }
  }

  return result;
}

/* -------------------------------------------------------------------- digest */

export interface DigestFigures {
  leads: number;
  appointmentsSet: number;
  showedUp: number;
  booked: number;
  noShow: number;
}

/**
 * The week's numbers for team leads and admins.
 *
 * Counted over the last 7 days, agency-wide — a digest is a management summary, so it
 * deliberately ignores the per-agent ownership filters the app applies everywhere else.
 * Keyed on the ISO week so re-running it on the same Monday says nothing twice.
 */
export async function weeklyDigest(
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<JobResult & { figures: DigestFigures }> {
  const result = { ...empty(), figures: { leads: 0, appointmentsSet: 0, showedUp: 0, booked: 0, noShow: 0 } };
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const rows = (await db.execute(sql`
    select
      (select count(*) from ${leads}
        where deleted_at is null and created_at >= ${since}::timestamptz)          as leads,
      (select count(*) from ${appointments}
        where deleted_at is null and created_at >= ${since}::timestamptz)          as set,
      (select count(*) from ${appointments}
        where deleted_at is null and status = 'showed-up'
          and updated_at >= ${since}::timestamptz)                                  as showed,
      (select count(*) from ${appointments}
        where deleted_at is null and outcome = 'booked'
          and updated_at >= ${since}::timestamptz)                                  as booked,
      (select count(*) from ${appointments}
        where deleted_at is null and status = 'no-show'
          and updated_at >= ${since}::timestamptz)                                  as noshow
  `)) as unknown as Array<Record<string, string | number>>;

  const r = rows[0] ?? {};
  const n = (k: string) => Number(r[k] ?? 0);
  result.figures = {
    leads: n("leads"),
    appointmentsSet: n("set"),
    showedUp: n("showed"),
    booked: n("booked"),
    noShow: n("noshow"),
  };

  const recipients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(
      eq(users.active, true),
      isNull(users.deletedAt),
      sql`${users.role} in ('admin','team_lead')`,
    ));

  const f = result.figures;
  const verdict = f.showedUp + f.noShow > 0
    ? ` No-show rate ${Math.round((f.noShow / (f.showedUp + f.noShow)) * 100)}%.`
    : "";

  // ISO-ish week key: the Monday of the current Malaysian week.
  const weekKey = myDate(new Date(Date.now() - ((myDayNumber(new Date()) + 3) % 7) * 86_400_000));

  for (const u of recipients) {
    result.considered++;
    if (dryRun) continue;
    const res = await notify({
      userId: u.id,
      kind: "digest",
      title: `Last week: ${f.leads} leads, ${f.booked} booked`,
      body:
        `${f.appointmentsSet} appointments set, ${f.showedUp} showed up, ` +
        `${f.noShow} no-shows.${verdict}`,
      link: "/reports",
      dedupeKey: `digest:${weekKey}`,
    });
    if (res.created) result.notified++;
    else if (res.reason === "duplicate") result.duplicates++;
  }

  return result;
}
