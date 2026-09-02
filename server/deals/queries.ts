/** Deal read helpers + pipeline board data, RBAC scoped. */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deals, dealStages, contacts, properties, projects, type Deal, type DealStage, type User } from "@/lib/db/schema";
import { DEAL_PIPELINE } from "@/lib/constants";
import { ownershipFilter } from "@/lib/auth";
import { visibleUserIds } from "@/server/users/hierarchy";

export type DealPipeline = (typeof DEAL_PIPELINE)[number];

export interface BoardCard {
  id: string;
  contactId: string;
  contactName: string;
  /** The listing or the project, whichever this deal is against. */
  subjectTitle: string | null;
  value: number | null;
  stageId: string;
}

export interface BoardColumn {
  stage: DealStage;
  cards: BoardCard[];
}

/** Stages for one pipeline, in order. Omit `pipeline` for every stage. */
export async function listStages(pipeline?: DealPipeline): Promise<DealStage[]> {
  return db
    .select()
    .from(dealStages)
    .where(and(isNull(dealStages.deletedAt), pipeline ? eq(dealStages.pipeline, pipeline) : undefined))
    .orderBy(asc(dealStages.sortOrder));
}

/**
 * One pipeline's board, grouped by stage and scoped to what the user may see.
 *
 * Filtered on BOTH the stage set and `dealType`. Filtering on stages alone would be
 * enough while every deal sits in its own pipeline's stages, but a deal moved by hand
 * or left over from before the split would then appear on a board it does not belong
 * to — visible, un-droppable and confusing.
 */
export async function getBoard(user: User, pipeline: DealPipeline = "resale"): Promise<BoardColumn[]> {
  const teamIds = user.role === "team_lead" ? await visibleUserIds(user) : undefined;

  const stages = await listStages(pipeline);
  const stageIds = new Set(stages.map((s) => s.id));

  const rows = await db
    .select({
      id: deals.id,
      contactId: deals.contactId,
      contactName: contacts.name,
      propertyTitle: properties.title,
      projectName: projects.name,
      value: deals.value,
      stageId: deals.stageId,
      dealType: deals.dealType,
    })
    .from(deals)
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .leftJoin(projects, eq(deals.projectId, projects.id))
    .where(and(isNull(deals.deletedAt), ownershipFilter(user, deals.assignedTo, teamIds)))
    .orderBy(asc(deals.createdAt));

  const mine = rows.filter(
    (r) => stageIds.has(r.stageId) && (pipeline === "project" ? r.dealType === "project" : r.dealType !== "project"),
  );

  return stages.map((stage) => ({
    stage,
    cards: mine
      .filter((r) => r.stageId === stage.id)
      .map((r) => ({
        id: r.id,
        contactId: r.contactId,
        contactName: r.contactName,
        subjectTitle: r.projectName ?? r.propertyTitle,
        value: r.value,
        stageId: r.stageId,
      })),
  }));
}

/** Deals whose stage belongs to no current pipeline — orphaned by a stage deletion. */
export async function countOrphanedDeals(user: User): Promise<number> {
  const teamIds = user.role === "team_lead" ? await visibleUserIds(user) : undefined;
  const stages = await listStages();
  const known = new Set(stages.map((s) => s.id));
  const rows = await db
    .select({ stageId: deals.stageId })
    .from(deals)
    .where(and(isNull(deals.deletedAt), ownershipFilter(user, deals.assignedTo, teamIds)));
  return rows.filter((r) => !known.has(r.stageId)).length;
}

export async function getDealById(id: string): Promise<Deal | null> {
  const [row] = await db.select().from(deals).where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  return row ?? null;
}
