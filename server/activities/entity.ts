/**
 * Polymorphic entity resolution for activities.
 * Given entity_type + id, returns owner (for RBAC) + a display label & link.
 */
import { eq, inArray } from "drizzle-orm";
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

/**
 * Batch version of resolveEntity: ONE query per entity type instead of one per row.
 *
 * The dashboard used to call resolveEntity() inside a loop, which meant a round trip
 * per follow-up. With Singapore latency that was the single biggest contributor to a
 * slow dashboard. Keyed "entityType:entityId" for O(1) lookup by the caller.
 */
export async function resolveEntitiesBatch(
  idsByType: Map<EntityType, string[]>,
): Promise<Map<string, ResolvedEntity>> {
  const out = new Map<string, ResolvedEntity>();

  await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => {
      if (ids.length === 0) return;
      const unique = [...new Set(ids)];

      if (type === "leads") {
        const rows = await db
          .select({ id: leads.id, o: leads.assignedTo, n: leads.name })
          .from(leads)
          .where(inArray(leads.id, unique));
        for (const r of rows) {
          out.set(`leads:${r.id}`, {
            ownerId: r.o,
            label: `Lead · ${r.n}`,
            href: `/leads/${r.id}`,
          });
        }
        return;
      }

      if (type === "contacts") {
        const rows = await db
          .select({ id: contacts.id, o: contacts.assignedTo, n: contacts.name })
          .from(contacts)
          .where(inArray(contacts.id, unique));
        for (const r of rows) {
          out.set(`contacts:${r.id}`, {
            ownerId: r.o,
            label: `Contact · ${r.n}`,
            href: `/contacts/${r.id}`,
          });
        }
        return;
      }

      if (type === "properties") {
        const rows = await db
          .select({ id: properties.id, o: properties.assignedAgent, n: properties.title })
          .from(properties)
          .where(inArray(properties.id, unique));
        for (const r of rows) {
          out.set(`properties:${r.id}`, {
            ownerId: r.o,
            label: `Property · ${r.n}`,
            href: `/properties/${r.id}`,
          });
        }
        return;
      }

      if (type === "deals") {
        const rows = await db
          .select({ id: deals.id, o: deals.assignedTo, c: deals.contactId, n: contacts.name })
          .from(deals)
          .leftJoin(contacts, eq(deals.contactId, contacts.id))
          .where(inArray(deals.id, unique));
        for (const r of rows) {
          out.set(`deals:${r.id}`, {
            ownerId: r.o,
            label: `Deal · ${r.n ?? "—"}`,
            href: r.c ? `/contacts/${r.c}` : "/pipeline",
          });
        }
      }
    }),
  );

  return out;
}
