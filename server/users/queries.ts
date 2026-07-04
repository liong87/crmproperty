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

export async function getTeamMemberIds(teamId: string | null): Promise<string[]> {
  if (!teamId) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.teamId, teamId), isNull(users.deletedAt)));
  return rows.map((r) => r.id);
}
