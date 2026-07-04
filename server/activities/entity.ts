/**
 * Polymorphic entity resolution for activities.
 * Given entity_type + id, returns owner (for RBAC) + a display label & link.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads, contacts, properties, deals } from "@/lib/db/schema";
import { ENTITY_TYPE } from "@/lib/constants";

export type EntityType = (typeof ENTITY_TYPE)[number];

export interface ResolvedEntity {
  ownerId: string | null;
  label: string;
  href: string;
}

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPE as readonly string[]).includes(v);
}

export async function resolveEntity(
  entityType: EntityType,
  entityId: string,
): Promise<ResolvedEntity | null> {
  switch (entityType) {
    case "leads": {
      const [r] = await db.select({ o: leads.assignedTo, n: leads.name }).from(leads).where(eq(leads.id, entityId));
      return r ? { ownerId: r.o, label: `Lead · ${r.n}`, href: `/leads/${entityId}` } : null;
    }
    case "contacts": {
      const [r] = await db.select({ o: contacts.assignedTo, n: contacts.name }).from(contacts).where(eq(contacts.id, entityId));
      return r ? { ownerId: r.o, label: `Contact · ${r.n}`, href: `/contacts/${entityId}` } : null;
    }
    case "properties": {
      const [r] = await db.select({ o: properties.assignedAgent, n: properties.title }).from(properties).where(eq(properties.id, entityId));
      return r ? { ownerId: r.o, label: `Property · ${r.n}`, href: `/properties/${entityId}` } : null;
    }
    case "deals": {
      const [r] = await db
        .select({ o: deals.assignedTo, c: deals.contactId, n: contacts.name })
        .from(deals)
        .leftJoin(contacts, eq(deals.contactId, contacts.id))
        .where(eq(deals.id, entityId));
      return r ? { ownerId: r.o, label: `Deal · ${r.n ?? "—"}`, href: r.c ? `/contacts/${r.c}` : "/pipeline" } : null;
    }
    default:
      return null;
  }
}
