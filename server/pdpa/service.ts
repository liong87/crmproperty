/**
 * PDPA (Malaysia) data-subject operations for a contact and its originating lead.
 * Shared logic used by both the export API route and the hard-delete action.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, contacts, deals, activities, documents, messageLog } from "@/lib/db/schema";
import { storage } from "@/lib/storage";

export async function collectContactData(contactId: string) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
  if (!contact) return null;

  // Originating lead: either linked via contact.sourceLeadId or leads.convertedToContactId.
  const leadRows = await db
    .select()
    .from(leads)
    .where(or(eq(leads.convertedToContactId, contactId), contact.sourceLeadId ? eq(leads.id, contact.sourceLeadId) : undefined));

  const leadIds = leadRows.map((l) => l.id);
  const dealRows = await db.select().from(deals).where(eq(deals.contactId, contactId));
  const dealIds = dealRows.map((d) => d.id);

  const entityMatch = or(
    and(eq(activities.entityType, "contacts"), eq(activities.entityId, contactId)),
    dealIds.length ? and(eq(activities.entityType, "deals"), inArray(activities.entityId, dealIds)) : undefined,
    leadIds.length ? and(eq(activities.entityType, "leads"), inArray(activities.entityId, leadIds)) : undefined,
  );
  const activityRows = await db.select().from(activities).where(entityMatch);

  const docMatch = or(
    and(eq(documents.entityType, "contacts"), eq(documents.entityId, contactId)),
    dealIds.length ? and(eq(documents.entityType, "deals"), inArray(documents.entityId, dealIds)) : undefined,
    leadIds.length ? and(eq(documents.entityType, "leads"), inArray(documents.entityId, leadIds)) : undefined,
  );
  const documentRows = await db.select().from(documents).where(docMatch);

  const msgMatch = or(
    and(eq(messageLog.entityType, "contacts"), eq(messageLog.entityId, contactId)),
    leadIds.length ? and(eq(messageLog.entityType, "leads"), inArray(messageLog.entityId, leadIds)) : undefined,
  );
  const messageRows = await db.select().from(messageLog).where(msgMatch);

  return {
    contact,
    leads: leadRows,
    deals: dealRows,
    activities: activityRows,
    documents: documentRows,
    messages: messageRows,
    ids: { leadIds, dealIds },
  };
}

/**
 * Right to erasure: HARD-delete a contact and everything tied to the person,
 * overriding soft-delete. Order respects FKs (docs/activities/messages -> deals -> contact -> lead).
 * Also removes the actual files from storage.
 */
export async function purgeContact(contactId: string): Promise<{ deletedDocuments: number }> {
  const data = await collectContactData(contactId);
  if (!data) return { deletedDocuments: 0 };
  const { leadIds, dealIds } = data.ids;

  // 1. Storage objects first (best-effort per file).
  for (const d of data.documents) {
    try {
      await storage.delete(d.storageKey);
    } catch {
      /* ignore individual storage failures — DB rows still purged */
    }
  }

  // 2. Child rows.
  if (data.documents.length) {
    await db.delete(documents).where(inArray(documents.id, data.documents.map((d) => d.id)));
  }
  if (data.activities.length) {
    await db.delete(activities).where(inArray(activities.id, data.activities.map((a) => a.id)));
  }
  if (data.messages.length) {
    await db.delete(messageLog).where(inArray(messageLog.id, data.messages.map((m) => m.id)));
  }
  if (dealIds.length) {
    await db.delete(deals).where(inArray(deals.id, dealIds));
  }

  // 3. The contact, then the originating lead(s).
  await db.delete(contacts).where(eq(contacts.id, contactId));
  if (leadIds.length) {
    await db.delete(leads).where(inArray(leads.id, leadIds));
  }

  return { deletedDocuments: data.documents.length };
}
