/** Activity reads: per-entity timeline + user follow-up reminders. */
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activities, users, type User } from "@/lib/db/schema";
import { isManagerOrAbove } from "@/lib/auth";
import { resolveEntity, type EntityType } from "./entity";

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
 * Agents see the ones they created; managers/admins see all.
 */
export async function listFollowUps(user: User): Promise<FollowUp[]> {
  const where = and(
    isNull(activities.deletedAt),
    isNotNull(activities.followUpAt),
    isNull(activities.followUpDoneAt),
    isManagerOrAbove(user) ? undefined : eq(activities.createdBy, user.id),
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
    .orderBy(asc(activities.followUpAt));

  const now = Date.now();
  const out: FollowUp[] = [];
  for (const r of rows) {
    if (!r.followUpAt) continue;
    const resolved = await resolveEntity(r.entityType as EntityType, r.entityId);
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

export async function countOpenFollowUps(user: User): Promise<number> {
  return (await listFollowUps(user)).length;
}
