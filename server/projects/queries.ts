/**
 * Project read helpers.
 *
 * Projects are agency-wide inventory: every agent sells every project, so lists are
 * NOT ownership-scoped (unlike leads and contacts). Edit permission is manager/admin
 * and is enforced in actions.ts.
 */
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  projects,
  projectUnitTypes,
  type Project,
  type ProjectUnitType,
} from "@/lib/db/schema";
import { DEFAULT_PAGE_SIZE, PROJECT_STATUS, PROPERTY_TYPE } from "@/lib/constants";
import type { Paginated } from "@/types";

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type ProjectPropertyType = (typeof PROPERTY_TYPE)[number];

/**
 * A project plus the figures summarising its unit types.
 *
 * The price range is DERIVED on read, never stored, so it cannot drift from the unit
 * types it summarises. It uses nett price where one is recorded and list price
 * otherwise, because nett is what a buyer actually pays.
 */
export interface ProjectListItem extends Project {
  unitTypeCount: number;
  priceFrom: number | null;
  priceTo: number | null;
}

export interface ListProjectsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: ProjectStatus;
  state?: string;
  propertyType?: ProjectPropertyType;
}

/** Postgres returns bigint/numeric aggregates as strings on some drivers. */
const toNum = (v: string | number | null): number | null => (v == null ? null : Number(v));

/** One grouped query for the whole page, not one per row. */
async function summarise(projectIds: string[]) {
  const out = new Map<string, { unitTypeCount: number; priceFrom: number | null; priceTo: number | null }>();
  if (projectIds.length === 0) return out;

  const rows = await db
    .select({
      projectId: projectUnitTypes.projectId,
      unitTypeCount: sql<number>`count(*)::int`,
      priceFrom: sql<string | number | null>`min(coalesce(${projectUnitTypes.nettPrice}, ${projectUnitTypes.listPrice}))`,
      priceTo: sql<string | number | null>`max(coalesce(${projectUnitTypes.nettPrice}, ${projectUnitTypes.listPrice}))`,
    })
    .from(projectUnitTypes)
    .where(and(inArray(projectUnitTypes.projectId, projectIds), isNull(projectUnitTypes.deletedAt)))
    .groupBy(projectUnitTypes.projectId);

  for (const r of rows) {
    out.set(r.projectId, {
      unitTypeCount: r.unitTypeCount,
      priceFrom: toNum(r.priceFrom),
      priceTo: toNum(r.priceTo),
    });
  }
  return out;
}

export async function listProjectsPaginated(
  params: ListProjectsParams = {},
): Promise<Paginated<ProjectListItem>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const where = and(
    isNull(projects.deletedAt),
    params.status ? eq(projects.status, params.status) : undefined,
    params.state ? eq(projects.state, params.state) : undefined,
    params.propertyType ? eq(projects.propertyType, params.propertyType) : undefined,
    params.search
      ? or(
          ilike(projects.name, `%${params.search}%`),
          ilike(projects.developer, `%${params.search}%`),
          ilike(projects.area, `%${params.search}%`),
        )
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(projects).where(where),
  ]);

  const summary = await summarise(items.map((p) => p.id));

  return {
    items: items.map((p) => ({
      ...p,
      unitTypeCount: summary.get(p.id)?.unitTypeCount ?? 0,
      priceFrom: summary.get(p.id)?.priceFrom ?? null,
      priceTo: summary.get(p.id)?.priceTo ?? null,
    })),
    page,
    pageSize,
    total: countRows[0]?.count ?? 0,
  };
}

export async function getProjectById(id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  return row ?? null;
}

export async function listUnitTypes(projectId: string): Promise<ProjectUnitType[]> {
  return db
    .select()
    .from(projectUnitTypes)
    .where(and(eq(projectUnitTypes.projectId, projectId), isNull(projectUnitTypes.deletedAt)))
    .orderBy(asc(projectUnitTypes.sortOrder), asc(projectUnitTypes.label));
}

export async function getProjectWithUnitTypes(
  id: string,
): Promise<{ project: Project; unitTypes: ProjectUnitType[] } | null> {
  const project = await getProjectById(id);
  if (!project) return null;
  return { project, unitTypes: await listUnitTypes(id) };
}

export async function getUnitTypeById(id: string): Promise<ProjectUnitType | null> {
  const [row] = await db
    .select()
    .from(projectUnitTypes)
    .where(and(eq(projectUnitTypes.id, id), isNull(projectUnitTypes.deletedAt)));
  return row ?? null;
}

/** Lightweight options for pickers — used by lead capture and the scheduler later. */
export async function listProjectOptions(): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(isNull(projects.deletedAt), inArray(projects.status, ["upcoming", "open", "closing"])))
    .orderBy(asc(projects.name));
}
