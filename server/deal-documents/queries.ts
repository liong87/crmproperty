/**
 * Deal paperwork — the checklist and what is falling due.
 *
 * Scoped by the deal's owner, using the same ownership rules as everything else.
 */
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  dealDocuments, documentRequirements, deals, contacts, projects, properties, documents,
  type DealDocument, type User,
} from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";

export interface ChecklistItem extends DealDocument {
  /** Filename of the attached upload, when there is one. */
  filename: string | null;
  /** Whole days until due; negative when overdue. Null when no date is set. */
  daysUntilDue: number | null;
}

export interface DueDocumentRow {
  id: string;
  dealId: string;
  label: string;
  dueAt: Date;
  daysUntilDue: number;
  required: boolean;
  contactName: string;
  /** The project or listing the deal is against. */
  subjectTitle: string | null;
}

/**
 * Whole CALENDAR days until a deadline, counted in Malaysia time. Negative when overdue.
 *
 * Not elapsed milliseconds. A deadline is a date, not an instant: an item due at the
 * start of a day 9 days ago is "9 days overdue" to a person, but floor() over elapsed
 * time makes it 10, and an item due in 3 days reads as 2. Both directions were wrong,
 * and on a feature whose entire job is chasing dates an off-by-one is how people stop
 * trusting the number.
 *
 * Malaysia is UTC+8 all year, so shifting both sides and comparing UTC date parts gives
 * the calendar-day difference an agent would count on their fingers.
 */
const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

const myDayNumber = (d: Date): number =>
  Math.floor((d.getTime() + MY_OFFSET_MS) / 86_400_000);

const daysUntil = (d: Date | null): number | null => {
  if (!d) return null;
  return myDayNumber(d) - myDayNumber(new Date());
};

export async function listChecklist(dealId: string): Promise<ChecklistItem[]> {
  const rows = await db
    .select({ item: dealDocuments, filename: documents.filename })
    .from(dealDocuments)
    .leftJoin(documents, eq(dealDocuments.documentId, documents.id))
    .where(and(eq(dealDocuments.dealId, dealId), isNull(dealDocuments.deletedAt)))
    .orderBy(asc(dealDocuments.sortOrder), asc(dealDocuments.createdAt));

  return rows.map((r) => ({
    ...r.item,
    filename: r.filename,
    daysUntilDue: daysUntil(r.item.dueAt),
  }));
}

/** The template for a pipeline, used when a deal is created. */
export async function listRequirements(pipeline: string) {
  return db
    .select()
    .from(documentRequirements)
    .where(and(eq(documentRequirements.pipeline, pipeline), isNull(documentRequirements.deletedAt)))
    .orderBy(asc(documentRequirements.sortOrder));
}

/**
 * Outstanding paperwork due within `withinDays`, or already overdue.
 *
 * Overdue is included regardless of the window: a loan approval that expired last week
 * is more urgent than one expiring next Tuesday, and dropping it out of the list once
 * the date passes is exactly how it gets missed.
 */
export async function listDocumentsDue(user: User, withinDays = 14, limit = 50): Promise<DueDocumentRow[]> {
  const horizon = new Date(Date.now() + withinDays * 86_400_000);

  const rows = await db
    .select({
      id: dealDocuments.id,
      dealId: dealDocuments.dealId,
      label: dealDocuments.label,
      dueAt: dealDocuments.dueAt,
      required: dealDocuments.required,
      contactName: contacts.name,
      projectName: projects.name,
      propertyTitle: properties.title,
    })
    .from(dealDocuments)
    .innerJoin(deals, eq(dealDocuments.dealId, deals.id))
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(projects, eq(deals.projectId, projects.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .where(
      and(
        isNull(dealDocuments.deletedAt),
        isNull(dealDocuments.completedAt),
        isNull(deals.deletedAt),
        // A date is required to be "due" at all — an item with no deadline is simply
        // outstanding, and belongs on the deal, not in a chase list.
        lte(dealDocuments.dueAt, horizon),
        ownershipFilter(user, deals.assignedTo),
      ),
    )
    .orderBy(asc(dealDocuments.dueAt))
    .limit(limit);

  return rows
    .filter((r) => r.dueAt != null)
    .map((r) => ({
      id: r.id,
      dealId: r.dealId,
      label: r.label,
      dueAt: r.dueAt!,
      daysUntilDue: daysUntil(r.dueAt)!,
      required: r.required,
      contactName: r.contactName,
      subjectTitle: r.projectName ?? r.propertyTitle,
    }));
}

/** Count only — for the dashboard tile, which must not pay for the whole list. */
export async function countDocumentsDue(user: User, withinDays = 14): Promise<{ due: number; overdue: number }> {
  const horizon = new Date(Date.now() + withinDays * 86_400_000);
  const [row] = await db
    .select({
      due: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${dealDocuments.dueAt} < now())::int`,
    })
    .from(dealDocuments)
    .innerJoin(deals, eq(dealDocuments.dealId, deals.id))
    .where(
      and(
        isNull(dealDocuments.deletedAt),
        isNull(dealDocuments.completedAt),
        isNull(deals.deletedAt),
        lte(dealDocuments.dueAt, horizon),
        ownershipFilter(user, deals.assignedTo),
      ),
    );
  return { due: Number(row?.due ?? 0), overdue: Number(row?.overdue ?? 0) };
}

/** A deal with the bits needed to render its page. */
export async function getDealDetail(id: string) {
  const [row] = await db
    .select({
      deal: deals,
      contactName: contacts.name,
      contactPhone: contacts.phone,
      projectName: projects.name,
      propertyTitle: properties.title,
    })
    .from(deals)
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .leftJoin(projects, eq(deals.projectId, projects.id))
    .leftJoin(properties, eq(deals.propertyId, properties.id))
    .where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  return row ?? null;
}
