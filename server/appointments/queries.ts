import { and, asc, count, eq, isNull, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { appointments, properties, projects, contacts, leads, users, type User } from "@/lib/db/schema";
import { ownershipFilter, isManagerOrAbove } from "@/lib/auth";

export interface AppointmentRow {
  id: string;
  scheduledAt: Date;
  status: string;
  outcome: string | null;
  remark: string | null;
  notes: string | null;
  /** What the appointment is about: a resale listing, or a new-launch project. */
  subjectKind: "property" | "project";
  subjectId: string;
  subjectTitle: string;
  subjectDetail: string;
  subjectHref: string;
  clientName: string;
  clientPhone: string;
  /** Where to link for the client — leads and contacts live at different routes. */
  clientHref: string;
  /** The agent who owns the client and booked this. */
  setterName: string | null;
  /** Who runs the presentation. Null means the setter is closing it themselves. */
  closerName: string | null;
  /** True when the appointment is in the past and nobody recorded what happened. */
  needsOutcome: boolean;
}

/** Malaysia is UTC+8 with no daylight saving, so a fixed offset is correct here. */
const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Midnight tonight, Malaysia time, expressed as a UTC instant. */
export function endOfTodayMY(now = new Date()): Date {
  const my = new Date(now.getTime() + MY_OFFSET_MS);
  const midnightMy = Date.UTC(my.getUTCFullYear(), my.getUTCMonth(), my.getUTCDate() + 1, 0, 0, 0);
  return new Date(midnightMy - MY_OFFSET_MS);
}

/** Midnight at the end of tomorrow, Malaysia time. */
export function endOfTomorrowMY(now = new Date()): Date {
  return new Date(endOfTodayMY(now).getTime() + 24 * 60 * 60 * 1000);
}

// The setter and the closer are both rows in `users`, so the table is joined twice
// under two aliases. Without the alias the second join silently overwrites the first.
const setter = alias(users, "setter");
const closer = alias(users, "closer");

/**
 * One query, joined out to the names an agent needs to read the row.
 *
 * Both the subject (property or project) and the client (lead or contact) are
 * polymorphic, so all four are left-joined and coalesced in TypeScript. Joins beat the
 * alternative of querying per row, which is the mistake that made the dashboard slow.
 */
async function baseQuery(user: User) {
  return db
    .select({
      id: appointments.id,
      scheduledAt: appointments.scheduledAt,
      status: appointments.status,
      outcome: appointments.outcome,
      remark: appointments.remark,
      notes: appointments.notes,
      propertyId: appointments.propertyId,
      propertyTitle: properties.title,
      propertyArea: properties.area,
      projectId: appointments.projectId,
      projectName: projects.name,
      projectArea: projects.area,
      projectDeveloper: projects.developer,
      contactId: appointments.contactId,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      leadId: appointments.leadId,
      leadName: leads.name,
      leadPhone: leads.phone,
      setterName: setter.name,
      closerName: closer.name,
    })
    .from(appointments)
    .leftJoin(properties, eq(appointments.propertyId, properties.id))
    .leftJoin(projects, eq(appointments.projectId, projects.id))
    .leftJoin(contacts, eq(appointments.contactId, contacts.id))
    .leftJoin(leads, eq(appointments.leadId, leads.id))
    .leftJoin(setter, eq(appointments.assignedTo, setter.id))
    .leftJoin(closer, eq(appointments.closerId, closer.id))
    .where(
      and(
        isNull(appointments.deletedAt),
        // Agents see their own diary; managers and admins see the team's.
        ownershipFilter(user, appointments.assignedTo),
      ),
    )
    .orderBy(asc(appointments.scheduledAt));
}

type Row = Awaited<ReturnType<typeof baseQuery>>[number];

function toAppointment(r: Row, now: Date): AppointmentRow {
  const isLead = r.leadId != null;
  const isProject = r.projectId != null;
  return {
    id: r.id,
    scheduledAt: r.scheduledAt,
    status: r.status,
    outcome: r.outcome,
    remark: r.remark,
    notes: r.notes,
    subjectKind: isProject ? "project" : "property",
    subjectId: (isProject ? r.projectId : r.propertyId) ?? "",
    subjectTitle: (isProject ? r.projectName : r.propertyTitle) ?? "(deleted)",
    subjectDetail: isProject ? (r.projectDeveloper ?? r.projectArea ?? "") : (r.propertyArea ?? ""),
    subjectHref: isProject ? `/projects/${r.projectId}` : `/properties/${r.propertyId}`,
    clientName: (isLead ? r.leadName : r.contactName) ?? "(deleted client)",
    clientPhone: (isLead ? r.leadPhone : r.contactPhone) ?? "",
    clientHref: isLead ? `/leads/${r.leadId}` : `/contacts/${r.contactId}`,
    setterName: r.setterName,
    closerName: r.closerName,
    // The nudge that makes the feature worth having: an appointment that happened and
    // was never written up is the most common way a client's reaction gets lost.
    needsOutcome: r.status === "scheduled" && r.scheduledAt < now,
  };
}

export interface GroupedAppointments {
  overdue: AppointmentRow[];
  today: AppointmentRow[];
  tomorrow: AppointmentRow[];
  upcoming: AppointmentRow[];
  scope: "own" | "team";
}

/**
 * Appointments grouped the way an agent thinks about their day.
 *
 * "Overdue" is not a scheduling failure — it is an appointment that has happened and
 * needs writing up. It sits first because that is the action outstanding.
 */
export async function listGroupedAppointments(user: User): Promise<GroupedAppointments> {
  const now = new Date();
  const rows = await baseQuery(user);
  const all = rows.map((r) => toAppointment(r, now));

  const todayEnd = endOfTodayMY(now);
  const tomorrowEnd = endOfTomorrowMY(now);

  return {
    overdue: all.filter((v) => v.needsOutcome),
    today: all.filter((v) => !v.needsOutcome && v.scheduledAt <= todayEnd && v.scheduledAt >= now),
    tomorrow: all.filter(
      (v) => !v.needsOutcome && v.scheduledAt > todayEnd && v.scheduledAt <= tomorrowEnd,
    ),
    upcoming: all.filter((v) => !v.needsOutcome && v.scheduledAt > tomorrowEnd),
    scope: isManagerOrAbove(user) ? "team" : "own",
  };
}

/** Appointments at one property — shown on the property page. */
export async function listAppointmentsForProperty(
  user: User,
  propertyId: string,
): Promise<AppointmentRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows.filter((r) => r.propertyId === propertyId).map((r) => toAppointment(r, now));
}

/** Appointments at one project — shown on the project page. */
export async function listAppointmentsForProject(
  user: User,
  projectId: string,
): Promise<AppointmentRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows.filter((r) => r.projectId === projectId).map((r) => toAppointment(r, now));
}

/** Appointments for one client — shown on a lead or contact page. */
export async function listAppointmentsForClient(
  user: User,
  client: { contactId?: string; leadId?: string },
): Promise<AppointmentRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows
    .filter((r) =>
      client.leadId ? r.leadId === client.leadId : r.contactId === client.contactId,
    )
    .map((r) => toAppointment(r, now));
}

/** Count of appointments needing a write-up — for the dashboard tile. */
export async function countAppointmentsNeedingOutcome(user: User): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(appointments)
    .where(
      and(
        isNull(appointments.deletedAt),
        eq(appointments.status, "scheduled"),
        lt(appointments.scheduledAt, new Date()),
        ownershipFilter(user, appointments.assignedTo),
      ),
    );
  return row?.c ?? 0;
}

/** Upcoming appointments for the dashboard — the next few, soonest first. */
export async function listUpcomingAppointments(user: User, limit = 5): Promise<AppointmentRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows
    .map((r) => toAppointment(r, now))
    .filter((v) => v.status === "scheduled" && v.scheduledAt >= now)
    .slice(0, limit);
}

/* ---------- board ---------- */

export type BoardColumnKey = "scheduled" | "showed-up" | "booked" | "no-show" | "cancelled";

export interface BoardColumn {
  key: BoardColumnKey;
  label: string;
  items: AppointmentRow[];
}

export interface AppointmentBoard {
  columns: BoardColumn[];
  scope: "own" | "team";
  /** No-shows as a share of appointments that were either kept or missed. */
  noShowRate: number | null;
  /** Projects that actually have appointments, for the filter control. */
  projectFilters: { id: string; name: string }[];
}

/**
 * Appointments as a board, in the order the business moves through them:
 *
 *   Scheduled → Showed up → Booked        (with No show as the branch that matters)
 *
 * "Booked" is drawn as its own column even though it is an OUTCOME rather than a
 * status, because it is the column everyone is actually trying to fill and burying it
 * inside "showed up" hides the only number that pays anybody.
 *
 * Cancelled is last and usually empty — kept visible rather than hidden so that a
 * cancellation is never mistaken for a record that vanished.
 */
export async function listAppointmentBoard(
  user: User,
  opts: { projectId?: string } = {},
): Promise<AppointmentBoard> {
  const now = new Date();
  const rows = await baseQuery(user);
  const all = rows
    .map((r) => toAppointment(r, now))
    .filter((a) => !opts.projectId || a.subjectId === opts.projectId);

  const projectFilters = [
    ...new Map(
      rows
        .filter((r) => r.projectId != null)
        .map((r) => [r.projectId!, { id: r.projectId!, name: r.projectName ?? "(deleted project)" }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const showedUp = all.filter((a) => a.status === "showed-up");
  const booked = showedUp.filter((a) => a.outcome === "booked");
  const noShow = all.filter((a) => a.status === "no-show");

  const columns: BoardColumn[] = [
    // Soonest first while they are still ahead; most recent first once they are done.
    { key: "scheduled", label: "Scheduled", items: all.filter((a) => a.status === "scheduled") },
    { key: "showed-up", label: "Showed up", items: recentFirst(showedUp.filter((a) => a.outcome !== "booked")) },
    { key: "booked", label: "Booked", items: recentFirst(booked) },
    { key: "no-show", label: "No show", items: recentFirst(noShow) },
    { key: "cancelled", label: "Cancelled", items: recentFirst(all.filter((a) => a.status === "cancelled")) },
  ];

  const decided = showedUp.length + noShow.length;

  return {
    columns,
    scope: isManagerOrAbove(user) ? "team" : "own",
    noShowRate: decided > 0 ? noShow.length / decided : null,
    projectFilters,
  };
}

function recentFirst(items: AppointmentRow[]): AppointmentRow[] {
  return [...items].sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
}
