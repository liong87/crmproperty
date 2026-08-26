/**
 * Per-project lead routing.
 *
 * Round-robin used to be one global rotation across every active agent. Once leads
 * carry a project that is wrong: an agent who does not sell Skyline should not be
 * handed Skyline leads, and a developer's campaign budget should reach the people
 * working that launch.
 *
 * The rotation counter is per project, so adding a project does not perturb any other
 * project's sequence, and each pool advances at its own rate.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectPoolMembers, users } from "@/lib/db/schema";

/**
 * `assignment_counter.id` is varchar(50). "rr:" plus a 36-character UUID is 39, which
 * fits; the old "lead_round_robin" key is untouched and still serves unprojected leads.
 */
export const poolCounterKey = (projectId: string) => `rr:${projectId}`;

export interface PoolMember {
  userId: string;
  name: string;
}

/**
 * Active pool for a project, in rotation order.
 *
 * Members who have been deactivated as users are excluded here rather than filtered
 * later: an inactive account must never be handed a lead, and leaving them in the
 * rotation would silently drop every Nth lead into a dead inbox.
 */
export async function listPool(projectId: string): Promise<PoolMember[]> {
  const rows = await db
    .select({ userId: projectPoolMembers.userId, name: users.name })
    .from(projectPoolMembers)
    .innerJoin(users, eq(users.id, projectPoolMembers.userId))
    .where(
      and(
        eq(projectPoolMembers.projectId, projectId),
        eq(projectPoolMembers.active, true),
        isNull(projectPoolMembers.deletedAt),
        eq(users.active, true),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(projectPoolMembers.sortOrder), asc(projectPoolMembers.createdAt));
  return rows;
}

/**
 * Next member of a project's pool, or null when the project has no usable pool.
 *
 * Null is the caller's signal to fall back to the global rotation — a project with an
 * empty pool must still receive its leads.
 *
 * The counter is incremented in ONE statement and the new value returned, so two leads
 * arriving together cannot read the same index. The stored value increases forever and
 * the modulo is applied on read: storing the post-modulo value would bound the counter
 * by the *current* pool size, so adding a member would make the rotation jump.
 */
export async function pickFromPool(projectId: string): Promise<string | null> {
  const pool = await listPool(projectId);
  if (pool.length === 0) return null;

  const key = poolCounterKey(projectId);
  const rows = (await db.execute(sql`
    insert into assignment_counter (id, last_index)
    values (${key}, 0)
    on conflict (id) do update set last_index = assignment_counter.last_index + 1,
                                   updated_at = now()
    returning last_index
  `)) as unknown as Array<{ last_index: number }>;

  const ticket = Number(rows[0]?.last_index ?? 0);
  return pool[ticket % pool.length]?.userId ?? null;
}

/**
 * The member after `currentUserId` in the rotation — who a stalled lead passes to.
 *
 * Walks the pool rather than using the counter, so a pass-on hands the lead to the
 * next colleague in the visible order instead of an arbitrary position. Returns null
 * when there is nobody else to pass to, which is the common case for a pool of one and
 * must not be treated as an error.
 */
export function nextAfter(pool: PoolMember[], currentUserId: string | null): string | null {
  if (pool.length < 2) return null;
  const i = pool.findIndex((m) => m.userId === currentUserId);
  // Owner not in the pool any more (left the team, or was reassigned in by hand):
  // start the rotation at the top rather than giving up.
  if (i === -1) return pool[0]!.userId;
  return pool[(i + 1) % pool.length]!.userId;
}
