/** Lead read helpers. RBAC scoping applied here via ownershipFilter. */
import { and, asc, desc, eq, getTableColumns, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, users, type Lead, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import { visibleUserIds } from "@/server/users/hierarchy";
import { DEFAULT_PAGE_SIZE, LEAD_STATUS } from "@/lib/constants";
import type { Paginated } from "@/types";

export type LeadStatus = (typeof LEAD_STATUS)[number];

export interface ListLeadsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LeadStatus;
  sort?: LeadSort;
}

/** A lead row plus the name of whoever currently owns it. */
export type LeadWithAssignee = Lead & {
  assigneeName: string | null;
  projectName: string | null;
};

/**
 * Sort orders the list offers. Kept as a closed set rather than a column name from the
 * query string, because a column name from the query string is an injection waiting to
 * be written by somebody in a hurry.
 */
export const LEAD_SORTS = {
  newest: () => desc(leads.createdAt),
  oldest: () => asc(leads.createdAt),
  name: () => asc(leads.name),
  status: () => asc(leads.status),
} as const;

export type LeadSort = keyof typeof LEAD_SORTS;

export function parseLeadSort(raw: string | undefined): LeadSort {
  return raw && raw in LEAD_SORTS ? (raw as LeadSort) : "newest";
}

/**
 * Phone search that survives how people actually type numbers.
 *
 * Stored numbers are E.164 (+60178899011). Agents type "017-889 9011", "0178899011"
 * or paste "+60 17-889 9011". A plain ILIKE on the stored string matches none of
 * those, so the search looked broken for the one field it is used on most.
 *
 * Both sides are reduced to digits, and a leading Malaysian 0 is dropped so a local
 * number matches its E.164 form: 0178899011 -> 178899011, which is a suffix of
 * 60178899011.
 */
const phoneClause = (q: string) => {
  const digits = q.replace(/\D/g, "");
  if (digits.length < 4) return undefined;
  const local = digits.replace(/^0+/, "");
  return sql`regexp_replace(${leads.phone}, '\\D', '', 'g') like ${`%${local}%`}`;
};

export async function listLeadsPaginated(
  user: User,
  params: ListLeadsParams = {},
): Promise<Paginated<LeadWithAssignee>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const teamIds = user.role === "team_lead" ? await visibleUserIds(user) : undefined;

  const where = and(
    isNull(leads.deletedAt),
    ownershipFilter(user, leads.assignedTo, teamIds),
    params.status ? eq(leads.status, params.status) : undefined,
    /*
     * Remark bodies are searched too, and that is the whole point of the thread:
     * agents look a lead up by what was said on the call, not by remembering a name.
     * EXISTS rather than a join, so a lead with twenty remarks still returns once.
     */
    params.search
      ? or(
          ilike(leads.name, `%${params.search}%`),
          ilike(leads.phone, `%${params.search}%`),
          phoneClause(params.search),
          ilike(leads.email, `%${params.search}%`),
          sql`exists (
            select 1 from lead_remarks r
            where r.lead_id = ${sql.raw('"leads"."id"')}
              and r.deleted_at is null
              and r.body ilike ${`%${params.search}%`}
          )`,
        )
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    // Left join, not inner: an unassigned lead must still appear in the list. Losing
    // sight of a lead nobody owns is the worst possible outcome for this screen.
    db
      .select({
        ...getTableColumns(leads),
        assigneeName: users.name,
        projectName: sql<string | null>`(
          select p.name from projects p where p.id = ${sql.raw('"leads"."project_id"')}
        )`,
      })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedTo))
      .where(where)
      .orderBy(LEAD_SORTS[params.sort ?? "newest"]())
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(where),
  ]);

  return { items, page, pageSize, total: countRows[0]?.count ?? 0 };
}

/**
 * The project the originating lead was interested in, if any.
 *
 * Contacts carry no project of their own — the interest was recorded on the lead, and
 * `contacts.sourceLeadId` is the thread back to it. Used to pre-select the project when
 * a deal is created, so the pipeline a booking lands in matches the enquiry it came from.
 */
export async function getLeadProjectId(leadId: string | null | undefined): Promise<string | null> {
  if (!leadId) return null;
  const [row] = await db
    .select({ projectId: leads.projectId })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt)));
  return row?.projectId ?? null;
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
