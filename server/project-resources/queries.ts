/**
 * The sales kit — what the agency publishes to its agents, per project.
 *
 * Reads are deliberately NOT ownership-scoped. A sales kit is reference material every
 * agent is meant to have: price list, brochure, blank forms, panel lawyer. Scoping it
 * by who owns the project would recreate the problem this replaces, which is agents
 * asking in WhatsApp for the current price list because they cannot see it themselves.
 */
import { asc, eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projectResources, documents, type ProjectResource } from "@/lib/db/schema";
import { RESOURCE_CATEGORIES, CATEGORY_TITLES, type ResourceCategory } from "@/lib/sales-kit";

export interface KitItem extends ProjectResource {
  /** Filename of the attached upload, when this item is a file. */
  filename: string | null;
}

export interface KitGroup {
  category: ResourceCategory;
  title: string;
  items: KitItem[];
}

/**
 * The whole kit for a project, grouped for display.
 *
 * One query and a group in memory rather than six queries: a kit is a few dozen rows
 * at most, and the alternative is a round trip per category on every project page.
 */
export async function listSalesKit(projectId: string): Promise<KitGroup[]> {
  const rows = await db
    .select({ item: projectResources, filename: documents.filename })
    .from(projectResources)
    .leftJoin(documents, eq(projectResources.documentId, documents.id))
    .where(and(eq(projectResources.projectId, projectId), isNull(projectResources.deletedAt)))
    .orderBy(asc(projectResources.sortOrder), asc(projectResources.createdAt));

  const items: KitItem[] = rows.map((r) => ({ ...r.item, filename: r.filename }));

  return RESOURCE_CATEGORIES.map((category) => ({
    category,
    title: CATEGORY_TITLES[category],
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0);
}

/** A single item, for the actions that need to load one before changing it. */
export async function getResource(id: string): Promise<ProjectResource | null> {
  const [row] = await db
    .select()
    .from(projectResources)
    .where(and(eq(projectResources.id, id), isNull(projectResources.deletedAt)))
    .limit(1);
  return row ?? null;
}
