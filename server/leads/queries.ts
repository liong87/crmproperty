/** Lead read helpers. RBAC scoping applied here via ownershipFilter. */
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, type Lead, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import { getTeamMemberIds } from "@/server/users/queries";
import { DEFAULT_PAGE_SIZE, LEAD_STATUS } from "@/lib/constants";
import type { Paginated } from "@/types";

export type LeadStatus = (typeof LEAD_STATUS)[number];

export interface ListLeadsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus;
}

export async function listLeadsPaginated(
  user: User,
  params: ListLeadsParams = {},
): Promise<Paginated<Lead>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const teamIds = user.role === "manager" ? await getTeamMemberIds(user.teamId) : undefined;

  const where = and(
    isNull(leads.deletedAt),
    ownershipFilter(user, leads.assignedTo, teamIds),
    params.status ? eq(leads.status, params.status) : undefined,
    params.search
      ? or(
          ilike(leads.name, `%${params.search}%`),
          ilike(leads.phone, `%${params.search}%`),
          ilike(leads.email, `%${params.search}%`),
        )
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    db.select().from(leads).where(where).orderBy(desc(leads.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(where),
  ]);

  return { items, page, pageSize, total: countRows[0]?.count ?? 0 };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const [row] = await db.select().from(leads).where(and(eq(leads.id, id), isNull(leads.deletedAt)));
  return row ?? null;
}

/** Active agents for assignment dropdowns. */
export async function listAssignableAgents() {
  const { users } = await import("@/lib/db/schema");
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.active, true), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}
