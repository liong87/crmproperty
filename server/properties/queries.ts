/** Property read helpers. Inventory is shared, so lists are NOT ownership-scoped
 *  (agents match any property to their leads). Edit permission is enforced in actions. */
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { properties, type Property } from "@/lib/db/schema";
import { DEFAULT_PAGE_SIZE, PROPERTY_STATUS, LISTING_TYPE, PROPERTY_TYPE } from "@/lib/constants";
import type { Paginated } from "@/types";

export type PropertyStatus = (typeof PROPERTY_STATUS)[number];
export type ListingType = (typeof LISTING_TYPE)[number];
export type PropertyType = (typeof PROPERTY_TYPE)[number];

export interface ListPropertiesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PropertyStatus;
  listingType?: ListingType;
  propertyType?: PropertyType;
  state?: string;
}

export async function listPropertiesPaginated(
  params: ListPropertiesParams = {},
): Promise<Paginated<Property>> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const where = and(
    isNull(properties.deletedAt),
    params.status ? eq(properties.status, params.status) : undefined,
    params.listingType ? eq(properties.listingType, params.listingType) : undefined,
    params.propertyType ? eq(properties.propertyType, params.propertyType) : undefined,
    params.state ? eq(properties.state, params.state) : undefined,
    params.search
      ? or(
          ilike(properties.title, `%${params.search}%`),
          ilike(properties.area, `%${params.search}%`),
          ilike(properties.address, `%${params.search}%`),
        )
      : undefined,
  );

  const [items, countRows] = await Promise.all([
    db.select().from(properties).where(where).orderBy(desc(properties.createdAt)).limit(pageSize).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(properties).where(where),
  ]);

  return { items, page, pageSize, total: countRows[0]?.count ?? 0 };
}

export async function getPropertyById(id: string): Promise<Property | null> {
  const [row] = await db.select().from(properties).where(and(eq(properties.id, id), isNull(properties.deletedAt)));
  return row ?? null;
}
