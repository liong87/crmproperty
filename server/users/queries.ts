/** Read helpers for users. RBAC enforced by the caller (server actions / pages). */
import { and, asc, isNull, ilike, or, sql, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Paginated } from "@/types";

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export async function listUsersPaginated(params: ListUsersParams = {}): Promise<Paginated<User>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const where = and(
    isNull(users.deletedAt),
    params.search
      ? or(ilike(users.name, `%${params.search}%`), ilike(users.email, `%${params.search}%`))
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    db.select().from(users).where(where).orderBy(asc(users.name)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
  ]);

  return { items, page, pageSize, total: countRows[0]?.count ?? 0 };
}

/**
 * REMOVED — see server/users/hierarchy.ts `visibleUserIds`.
 *
 * This grouped by `users.team_id`, a bare uuid with no table behind it and no way to
 * say who led the team. Scoping now follows `team_lead_id`, which is the fact the
 * agency actually maintains.
 */


export interface AssignableUser {
  id: string;
  name: string;
  role: string;
}

/**
 * Who a lead can be handed to.
 *
 * Active users only. An inactive account is one that has left or has not been approved
 * yet, and assigning them a lead files it somewhere nobody is looking — which reads as
 * "assigned" on every report while nobody works it.
 */
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  return db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.active, true), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}
