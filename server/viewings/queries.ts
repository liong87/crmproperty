import { and, asc, count, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { viewings, properties, contacts, leads, users, type User } from "@/lib/db/schema";
import { ownershipFilter, isManagerOrAbove } from "@/lib/auth";

export interface ViewingRow {
  id: string;
  scheduledAt: Date;
  status: string;
  outcome: string | null;
  notes: string | null;
  propertyId: string;
  propertyTitle: string;
  propertyArea: string;
  clientName: string;
  clientPhone: string;
  /** Where to link for the client — leads and contacts live at different routes. */
  clientHref: string;
  agentName: string | null;
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

/**
 * One query, joined out to the names an agent needs to read the row.
 *
 * The client is polymorphic — a viewing hangs off either a lead or a contact — so
 * both are left-joined and coalesced in TypeScript. Two joins beat the alternative of
 * querying per row, which is the mistake that made the dashboard slow before.
 */
async function baseQuery(user: User) {
  return db
    .select({
      id: viewings.id,
      scheduledAt: viewings.scheduledAt,
      status: viewings.status,
      outcome: viewings.outcome,
      notes: viewings.notes,
      propertyId: viewings.propertyId,
      propertyTitle: properties.title,
      propertyArea: properties.area,
      contactId: viewings.contactId,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      leadId: viewings.leadId,
      leadName: leads.name,
      leadPhone: leads.phone,
      agentName: users.name,
    })
    .from(viewings)
    .leftJoin(properties, eq(viewings.propertyId, properties.id))
    .leftJoin(contacts, eq(viewings.contactId, contacts.id))
    .leftJoin(leads, eq(viewings.leadId, leads.id))
    .leftJoin(users, eq(viewings.assignedTo, users.id))
    .where(
      and(
        isNull(viewings.deletedAt),
        // Agents see their own diary; managers and admins see the team's.
        ownershipFilter(user, viewings.assignedTo),
      ),
    )
    .orderBy(asc(viewings.scheduledAt));
}

type Row = Awaited<ReturnType<typeof baseQuery>>[number];

function toViewing(r: Row, now: Date): ViewingRow {
  const isLead = r.leadId != null;
  return {
    id: r.id,
    scheduledAt: r.scheduledAt,
    status: r.status,
    outcome: r.outcome,
    notes: r.notes,
    propertyId: r.propertyId,
    propertyTitle: r.propertyTitle ?? "(deleted listing)",
    propertyArea: r.propertyArea ?? "",
    clientName: (isLead ? r.leadName : r.contactName) ?? "(deleted client)",
    clientPhone: (isLead ? r.leadPhone : r.contactPhone) ?? "",
    clientHref: isLead ? `/leads/${r.leadId}` : `/contacts/${r.contactId}`,
    agentName: r.agentName,
    // The nudge that makes the feature worth having: a viewing that happened and was
    // never written up is the most common way a client's reaction gets lost.
    needsOutcome: r.status === "scheduled" && r.scheduledAt < now,
  };
}

export interface GroupedViewings {
  overdue: ViewingRow[];
  today: ViewingRow[];
  tomorrow: ViewingRow[];
  upcoming: ViewingRow[];
  scope: "own" | "team";
}

/**
 * Viewings grouped the way an agent thinks about their day.
 *
 * "Overdue" is not a scheduling failure — it is a viewing that has happened and needs
 * writing up. It sits first because that is the action outstanding.
 */
export async function listGroupedViewings(user: User): Promise<GroupedViewings> {
  const now = new Date();
  const rows = await baseQuery(user);
  const all = rows.map((r) => toViewing(r, now));

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

/** Viewings for one property — shown on the property page. */
export async function listViewingsForProperty(
  user: User,
  propertyId: string,
): Promise<ViewingRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows.filter((r) => r.propertyId === propertyId).map((r) => toViewing(r, now));
}

/** Viewings for one client — shown on a lead or contact page. */
export async function listViewingsForClient(
  user: User,
  client: { contactId?: string; leadId?: string },
): Promise<ViewingRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows
    .filter((r) =>
      client.leadId ? r.leadId === client.leadId : r.contactId === client.contactId,
    )
    .map((r) => toViewing(r, now));
}

/** Count of viewings needing a write-up — for the dashboard tile. */
export async function countViewingsNeedingOutcome(user: User): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(viewings)
    .where(
      and(
        isNull(viewings.deletedAt),
        eq(viewings.status, "scheduled"),
        lt(viewings.scheduledAt, new Date()),
        ownershipFilter(user, viewings.assignedTo),
      ),
    );
  return row?.c ?? 0;
}

/** Upcoming viewings for the dashboard — the next few, soonest first. */
export async function listUpcomingViewings(user: User, limit = 5): Promise<ViewingRow[]> {
  const now = new Date();
  const rows = await baseQuery(user);
  return rows
    .map((r) => toViewing(r, now))
    .filter((v) => v.status === "scheduled" && v.scheduledAt >= now)
    .slice(0, limit);
}
