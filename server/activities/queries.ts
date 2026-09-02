/** Activity reads: per-entity timeline + user follow-up reminders. */
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activities, users, type User } from "@/lib/db/schema";
import { isTeamLeadOrAbove } from "@/lib/auth";
import { resolveEntitiesBatch, type EntityType } from "./entity";

export interface TimelineItem {
  id: string;
  type: string;
  body: string | null;
  occurredAt: Date;
  followUpAt: Date | null;
  followUpDoneAt: Date | null;
  createdByName: string | null;
}

export async function listActivitiesForEntity(
  entityType: EntityType,
  entityId: string,
): Promise<TimelineItem[]> {
  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      body: activities.body,
      occurredAt: activities.occurredAt,
      followUpAt: activities.followUpAt,
      followUpDoneAt: activities.followUpDoneAt,
      createdByName: users.name,
    })
    .from(activities)
    .leftJoin(users, eq(activities.createdBy, users.id))
    .where(and(eq(activities.entityType, entityType), eq(activities.entityId, entityId), isNull(activities.deletedAt)))
    .orderBy(desc(activities.occurredAt));
  return rows;
}

export interface FollowUp {
  id: string;
  type: string;
  body: string | null;
  followUpAt: Date;
  entityLabel: string;
  entityHref: string;
  overdue: boolean;
}

/**
 * Open follow-ups (follow_up_at set, not yet done).
 * Agents see the ones they created; team leads/admins see all.
 *
 * Two fixes over the original, both of which showed up as a slow dashboard:
 *
 *  1. LIMIT. There was none, so every open follow-up in the agency was fetched
 *     even though the dashboard displays five.
 *  2. No more N+1. It called resolveEntity() once PER ROW inside a loop, so 200
 *     open follow-ups meant 200 extra sequential round trips. Labels are now
 *     resolved with ONE query per entity type (4 at most, usually 1-2), batched
 *     with an IN list.
 */
export async function listFollowUps(user: User, limit = 50): Promise<FollowUp[]> {
  const where = and(
    isNull(activities.deletedAt),
    isNotNull(activities.followUpAt),
    isNull(activities.followUpDoneAt),
    isTeamLeadOrAbove(user) ? undefined : eq(activities.createdBy, user.id),
  );

  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      body: activities.body,
      followUpAt: activities.followUpAt,
      entityType: activities.entityType,
      entityId: activities.entityId,
    })
    .from(activities)
    .where(where)
    .orderBy(asc(activities.followUpAt))
    .limit(limit);

  // Group the ids we need by entity type, then resolve each type in one query.
  const byType = new Map<EntityType, string[]>();
  for (const r of rows) {
    const t = r.entityType as EntityType;
    const list = byType.get(t);
    if (list) list.push(r.entityId);
    else byType.set(t, [r.entityId]);
  }
  const labels = await resolveEntitiesBatch(byType);

  const now = Date.now();
  const out: FollowUp[] = [];
  for (const r of rows) {
    if (!r.followUpAt) continue;
    const resolved = labels.get(`${r.entityType}:${r.entityId}`);
    out.push({
      id: r.id,
      type: r.type,
      body: r.body,
      followUpAt: r.followUpAt,
      entityLabel: resolved?.label ?? "(deleted)",
      entityHref: resolved?.href ?? "#",
      overdue: r.followUpAt.getTime() < now,
    });
  }
  return out;
}

/** Count only — never materialise every row just to measure how many there are. */
export async function countOpenFollowUps(user: User): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        isNull(activities.deletedAt),
        isNotNull(activities.followUpAt),
        isNull(activities.followUpDoneAt),
        isTeamLeadOrAbove(user) ? undefined : eq(activities.createdBy, user.id),
      ),
    );
  return row?.n ?? 0;
}
