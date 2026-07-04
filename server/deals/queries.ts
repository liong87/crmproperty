/** Deal read helpers + pipeline board data, RBAC scoped. */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deals, dealStages, contacts, properties, type Deal, type DealStage, type User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import { getTeamMemberIds } from "@/server/users/queries";

export interface BoardCard {
  id: string;
  contactId: string;
  contactName: string;
  propertyTitle: string | null;
  value: number | null;
  stageId: string;
}

export interface BoardColumn {
  stage: DealStage;
  cards: BoardCard[];
}

export async function listStages(): Promise<DealStage[]> {
  return db.select().from(dealStages).where(isNull(dealStages.deletedAt)).orderBy(asc(dealStages.sortOrder));
}

/** Whole pipeline grouped by stage, scoped to what the user may see. */
export async function getBoard(user: User): Promise<BoardColumn[]> {
  const teamIds = user.role === "manager" ? await getTeamMemberIds(user.teamId) : undefined;

  const stages = await listStages();

  const rows = await db
    .select({
      id: deals.id,
      contactId: deals.contactId,
      contactName: contacts.name,
      propertyTitle: properties.title,
      value: deals.value,
      stageId: deals.stageId,
    })
    .from(deals)
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .where(and(isNull(deals.deletedAt), ownershipFilter(user, deals.assignedTo, teamIds)))
    .orderBy(asc(deals.createdAt));

  return stages.map((stage) => ({
    stage,
    cards: rows.filter((r) => r.stageId === stage.id),
  }));
}

export async function getDealById(id: string): Promise<Deal | null> {
  const [row] = await db.select().from(deals).where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  return row ?? null;
}
