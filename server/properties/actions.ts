"use server";
/** Property mutations. View is shared; edit is RBAC-scoped by assignedAgent. */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { properties, type Property } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, isManagerOrAbove, AuthorizationError } from "@/lib/auth";
import {
  LISTING_TYPE, PROPERTY_TYPE, TENURE, TITLE_TYPE, FURNISHING, PROPERTY_STATUS,
} from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getPropertyById } from "./queries";

const phoneRe = /^\+[1-9]\d{6,14}$/;
const optInt = z.coerce.number().int().nonnegative().optional().nullable();

const baseSchema = z.object({
  title: z.string().min(1).max(255),
  listingType: z.enum(LISTING_TYPE),
  propertyType: z.enum(PROPERTY_TYPE),
  tenure: z.enum(TENURE).optional().nullable(),
  leaseholdExpiry: z.coerce.number().int().min(1900).max(3000).optional().nullable(),
  bumiLot: z.boolean().optional(),
  titleType: z.enum(TITLE_TYPE).optional().nullable(),
  state: z.string().min(1).max(100),
  area: z.string().min(1).max(255),
  address: z.string().max(1000).optional().nullable(),
  builtUpSqft: optInt,
  landSqft: optInt,
  bedrooms: optInt,
  bathrooms: optInt,
  carParks: optInt,
  askingPrice: z.coerce.number().int().nonnegative(), // MYR cents
  furnishing: z.enum(FURNISHING).optional().nullable(),
  status: z.enum(PROPERTY_STATUS).optional(),
  ownerName: z.string().max(255).optional().nullable(),
  ownerPhone: z.string().regex(phoneRe).optional().or(z.literal("")).nullable(),
  assignedAgent: z.string().uuid().optional().nullable(),
});

const updateSchema = baseSchema.partial().extend({ id: z.string().uuid() });

export async function createProperty(input: unknown): Promise<ActionResult<Property>> {
  try {
    const me = await requireDbUser();
    const d = baseSchema.parse(input);
    // Agents own what they create; managers/admins may assign.
    const assignedAgent = isManagerOrAbove(me) && d.assignedAgent ? d.assignedAgent : me.id;

    const [row] = await db
      .insert(properties)
      .values({
        title: d.title,
        listingType: d.listingType,
        propertyType: d.propertyType,
        tenure: d.tenure ?? null,
        leaseholdExpiry: d.leaseholdExpiry ?? null,
        bumiLot: d.bumiLot ?? false,
        titleType: d.titleType ?? null,
        state: d.state,
        area: d.area,
        address: d.address ?? null,
        builtUpSqft: d.builtUpSqft ?? null,
        landSqft: d.landSqft ?? null,
        bedrooms: d.bedrooms ?? null,
        bathrooms: d.bathrooms ?? null,
        carParks: d.carParks ?? null,
        askingPrice: d.askingPrice,
        furnishing: d.furnishing ?? null,
        status: d.status ?? "active",
        ownerName: d.ownerName ?? null,
        ownerPhone: d.ownerPhone || null,
        assignedAgent,
      })
      .returning();

    revalidatePath("/properties");
    return ok(row!);
  } catch (err) {
    return handle(err, "createProperty");
  }
}

export async function updateProperty(input: unknown): Promise<ActionResult<Property>> {
  try {
    const me = await requireDbUser();
    const d = updateSchema.parse(input);
    const existing = await getPropertyById(d.id);
    if (!existing) return fail("Property not found.");
    assertCanEdit(me, existing.assignedAgent);

    const assignedAgent =
      d.assignedAgent !== undefined && isManagerOrAbove(me) ? d.assignedAgent : existing.assignedAgent;

    const [row] = await db
      .update(properties)
      .set({
        title: d.title ?? existing.title,
        listingType: d.listingType ?? existing.listingType,
        propertyType: d.propertyType ?? existing.propertyType,
        tenure: d.tenure !== undefined ? d.tenure : existing.tenure,
        leaseholdExpiry: d.leaseholdExpiry !== undefined ? d.leaseholdExpiry : existing.leaseholdExpiry,
        bumiLot: d.bumiLot !== undefined ? d.bumiLot : existing.bumiLot,
        titleType: d.titleType !== undefined ? d.titleType : existing.titleType,
        state: d.state ?? existing.state,
        area: d.area ?? existing.area,
        address: d.address !== undefined ? d.address : existing.address,
        builtUpSqft: d.builtUpSqft !== undefined ? d.builtUpSqft : existing.builtUpSqft,
        landSqft: d.landSqft !== undefined ? d.landSqft : existing.landSqft,
        bedrooms: d.bedrooms !== undefined ? d.bedrooms : existing.bedrooms,
        bathrooms: d.bathrooms !== undefined ? d.bathrooms : existing.bathrooms,
        carParks: d.carParks !== undefined ? d.carParks : existing.carParks,
        askingPrice: d.askingPrice ?? existing.askingPrice,
        furnishing: d.furnishing !== undefined ? d.furnishing : existing.furnishing,
        status: d.status ?? existing.status,
        ownerName: d.ownerName !== undefined ? d.ownerName : existing.ownerName,
        ownerPhone: d.ownerPhone !== undefined ? d.ownerPhone || null : existing.ownerPhone,
        assignedAgent,
      })
      .where(eq(properties.id, d.id))
      .returning();

    revalidatePath("/properties");
    revalidatePath(`/properties/${d.id}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "updateProperty");
  }
}

export async function changePropertyStatus(
  id: string,
  status: (typeof PROPERTY_STATUS)[number],
): Promise<ActionResult<Property>> {
  try {
    const me = await requireDbUser();
    z.enum(PROPERTY_STATUS).parse(status);
    const existing = await getPropertyById(id);
    if (!existing) return fail("Property not found.");
    assertCanEdit(me, existing.assignedAgent);
    const [row] = await db.update(properties).set({ status }).where(eq(properties.id, id)).returning();
    revalidatePath("/properties");
    revalidatePath(`/properties/${id}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "changePropertyStatus");
  }
}

/** Soft-delete a property (recoverable; keeps audit trail). Owner or manager/admin only. */
export async function deleteProperty(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(id);
    const existing = await getPropertyById(id);
    if (!existing) return fail("Property not found.");
    assertCanEdit(me, existing.assignedAgent);
    await db.update(properties).set({ deletedAt: new Date() }).where(eq(properties.id, id));
    revalidatePath("/properties");
  } catch (err) {
    return handle(err, "deleteProperty");
  }
  redirect("/properties");
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail(err.message);
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
