/** Contact read helpers with RBAC scoping. */
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contacts, type Contact, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import { getTeamMemberIds } from "@/server/users/queries";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import type { Paginated } from "@/types";

export interface ListContactsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export async function listContactsPaginated(
  user: User,
  params: ListContactsParams = {},
): Promise<Paginated<Contact>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const teamIds = user.role === "manager" ? await getTeamMemberIds(user.teamId) : undefined;

  const where = and(
    isNull(contacts.deletedAt),
    ownershipFilter(user, contacts.assignedTo, teamIds),
    params.search
      ? or(
          ilike(contacts.name, `%${params.search}%`),
          ilike(contacts.phone, `%${params.search}%`),
          ilike(contacts.email, `%${params.search}%`),
        )
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(contacts).where(where),
  ]);

  return { items, page, pageSize, total: countRows[0]?.count ?? 0 };
}

export async function getContactById(id: string): Promise<Contact | null> {
  const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  return row ?? null;
}
