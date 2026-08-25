/**
 * Leads nobody has touched.
 *
 * The waste this addresses is real and universal: an enquiry the agency paid for
 * sits on one agent's list, unworked, until it is cold. ZienCRM's answer is to
 * reassign it automatically after N days. That works for project sales, where agents
 * are interchangeable closers on the same launch — and it is the wrong answer here,
 * where the client relationship IS the agent's asset and an automatic transfer is,
 * in commission terms, taking a lead off one person and giving it to another. That is
 * how internal disputes start.
 *
 * So: surface, do not confiscate. A manager sees what is going cold and decides,
 * with the reason recorded. Same waste eliminated, no silent transfer.
 *
 * Scoped by the usual ownership rules, which means an agent opening this page sees
 * their own neglected leads before their manager raises it — which is the outcome
 * everybody would prefer.
 */
import { and, asc, eq, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, users, activities, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";

export interface StaleLeadRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  assignedTo: string | null;
  assignedName: string | null;
  createdAt: Date;
  /** Last logged activity, or null when nothing has ever been logged. */
  lastActivityAt: Date | null;
  /** Whole days since the last activity, or since creation if there is none. */
  idleDays: number;
}

/** Default before a lead counts as neglected. Two weeks is a fortnight of silence. */
export const STALE_AFTER_DAYS = 14;

/**
 * Open leads with no activity for `days`.
 *
 * "Open" excludes converted and disqualified leads: both are finished work, and
 * including them would bury the handful that still need someone to call.
 *
 * Idleness is measured from the most recent activity, falling back to the lead's
 * creation. A brand-new lead created this morning with nothing logged is not stale —
 * it is new — which the date arithmetic handles without a special case.
 */
function staleWhere(user: User, days: number): SQL | undefined {
  const cutoff = sql`now() - make_interval(days => ${days}::int)`;
  return and(
    isNull(leads.deletedAt),
    isNull(leads.convertedToContactId),
    ne(leads.status, "disqualified"),
    ownershipFilter(user, leads.assignedTo),
    // COALESCE, not a join on the latest activity: a lead with no activity at all is
    // the most neglected kind, and an inner join would exclude exactly those.
    sql`coalesce((
      select max(a.occurred_at) from ${activities} a
      where a.entity_type = 'leads' and a.entity_id = ${leads.id} and a.deleted_at is null
    ), ${leads.createdAt}) < ${cutoff}`,
  );
}

export async function listStaleLeads(
  user: User,
  days = STALE_AFTER_DAYS,
  limit = 100,
): Promise<StaleLeadRow[]> {
  const lastActivity = sql<Date | null>`(
    select max(a.occurred_at) from ${activities} a
    where a.entity_type = 'leads' and a.entity_id = ${leads.id} and a.deleted_at is null
  )`;

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      status: leads.status,
      assignedTo: leads.assignedTo,
      assignedName: users.name,
      createdAt: leads.createdAt,
      lastActivityAt: lastActivity,
      idleDays: sql<number>`floor(extract(epoch from (
        now() - coalesce(${lastActivity}, ${leads.createdAt})
      )) / 86400)::int`,
    })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(staleWhere(user, days))
    // Coldest first. The list is a work queue, not a browsable index.
    .orderBy(asc(sql`coalesce(${lastActivity}, ${leads.createdAt})`))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    lastActivityAt: r.lastActivityAt ? new Date(r.lastActivityAt) : null,
    idleDays: Number(r.idleDays),
  }));
}

/** Count only — for the dashboard tile, which must not pay for the whole list. */
export async function countStaleLeads(user: User, days = STALE_AFTER_DAYS): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(leads)
    .where(staleWhere(user, days));
  return Number(row?.c ?? 0);
}
