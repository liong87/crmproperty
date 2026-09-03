/**
 * Outreach activity per agent.
 *
 * The funnel already reports OUTCOMES — leads, appointments, show-ups, bookings —
 * which tells a manager where an agent loses people. It does not say whether the
 * agent picked up the phone at all. "Kevin only called 6 of his 20 leads" is the
 * conversation a team leader actually has, and no existing report supports it.
 *
 * Deliberately built from `users` outward with a LEFT JOIN, not from `activities`.
 * Grouping activities by creator would make an agent who logged nothing vanish from
 * the table entirely — and that agent is the whole reason to look.
 *
 * Scope follows the rule the rest of the app uses: an agent sees their own row, a
 * manager sees the team.
 *
 * A caveat that belongs in the UI as much as the code: this counts activities that
 * were LOGGED, not calls that were made. Nothing in the product dials a phone, so a
 * zero means "nothing recorded", which is not the same as "did no work". Treat it as
 * a prompt to ask, never as a verdict.
 */
import { and, eq, gte, lte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activities, users, type User } from "@/lib/db/schema";
import { visibleUserIds } from "@/server/users/hierarchy";

export interface AgentActivityRow {
  id: string;
  name: string;
  role: string;
  /** Activities of type `call` logged in the window. */
  calls: number;
  /** WhatsApp counts separately: it is the channel that actually gets replies here. */
  whatsapp: number;
  /** Distinct leads touched, so 20 calls to one lead does not read as broad coverage. */
  leadsTouched: number;
}

export interface AgentActivityData {
  scope: "own" | "team";
  sinceDays: number;
  rows: AgentActivityRow[];
  totalCalls: number;
  totalWhatsapp: number;
  /** True when nobody has logged anything — the table means nothing yet, and says so. */
  empty: boolean;
}

/**
 * Ordering and totals, split out from the query so they can be tested without a
 * database — the rest of this module is SQL and can only be exercised against one.
 */
export function summariseActivity(
  rows: AgentActivityRow[],
  scope: "own" | "team",
  sinceDays: number,
): AgentActivityData {
  // Least active first: the point of the table is finding who has gone quiet. Ties
  // break on name so the order is stable between loads rather than arbitrary.
  const sorted = [...rows].sort(
    (a, b) => a.calls + a.whatsapp - (b.calls + b.whatsapp) || a.name.localeCompare(b.name),
  );

  const totalCalls = sorted.reduce((n, r) => n + r.calls, 0);
  const totalWhatsapp = sorted.reduce((n, r) => n + r.whatsapp, 0);

  return {
    scope,
    sinceDays,
    rows: sorted,
    totalCalls,
    totalWhatsapp,
    empty: totalCalls + totalWhatsapp === 0,
  };
}

export async function getAgentActivity(
  user: User,
  window: { from: Date; to: Date },
): Promise<AgentActivityData> {
  // Empty means admin: no restriction. Anything else is an explicit id list, so a
  // Team Lead with no members scopes to themselves rather than to everybody.
  const visibleIds = await visibleUserIds(user);
  const { from: since, to: until } = window;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      calls: sql<number>`count(*) filter (where ${activities.type} = 'call')`.mapWith(Number),
      whatsapp: sql<number>`count(*) filter (where ${activities.type} = 'whatsapp')`.mapWith(Number),
      leadsTouched:
        sql<number>`count(distinct ${activities.entityId}) filter (where ${activities.entityType} = 'leads')`.mapWith(
          Number,
        ),
    })
    .from(users)
    // Every condition on activities lives in the JOIN, not the WHERE. In the WHERE it
    // would turn the left join into an inner one and drop the silent agents.
    .leftJoin(
      activities,
      and(
        eq(activities.createdBy, users.id),
        gte(activities.occurredAt, since),
        lte(activities.occurredAt, until),
        isNull(activities.deletedAt),
        inArray(activities.type, ["call", "whatsapp"]),
      ),
    )
    .where(
      and(
        eq(users.active, true),
        isNull(users.deletedAt),
        visibleIds.length > 0 ? inArray(users.id, visibleIds) : undefined,
      ),
    )
    .groupBy(users.id, users.name, users.role);

  // "own" only when the list is literally just this person — a Team Lead with one
  // member is looking at a team, however small.
  const isOwnOnly = visibleIds.length === 1 && visibleIds[0] === user.id;
  // Whole days spanned, for the caption the table prints. Derived from the window
  // rather than passed alongside it, so the two can never disagree.
  const days = Math.max(1, Math.round((until.getTime() - since.getTime()) / 86_400_000));
  return summariseActivity(rows, isOwnOnly ? "own" : "team", days);
}
