"use server";
/**
 * Project mutations.
 *
 * RBAC differs deliberately from properties. A resale listing belongs to the agent who
 * won it, so edit is scoped by assignedAgent. A project belongs to the AGENCY — the
 * principal signs with the developer and every agent sells it — so create/edit/delete
 * are manager and admin only, while all agents can view.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { projects, projectUnitTypes, type Project, type ProjectUnitType } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { PROPERTY_TYPE, TENURE, TITLE_TYPE, PROJECT_STATUS } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getProjectById, getUnitTypeById } from "./queries";

const optInt = z.coerce.number().int().nonnegative().optional().nullable();
/** Basis points: 250 = 2.50%. Capped at 100%. */
const optBp = z.coerce.number().int().min(0).max(10000).optional().nullable();
const optIso = z.string().datetime().optional().nullable();

const projectSchema = z.object({
  name: z.string().min(1).max(255),
  developer: z.string().max(255).optional().nullable(),
  propertyType: z.enum(PROPERTY_TYPE).optional().nullable(),
  state: z.string().min(1).max(100),
  area: z.string().min(1).max(255),
  address: z.string().max(1000).optional().nullable(),
  galleryAddress: z.string().max(1000).optional().nullable(),
  tenure: z.enum(TENURE).optional().nullable(),
  titleType: z.enum(TITLE_TYPE).optional().nullable(),
  launchAt: optIso,
  expectedVpAt: optIso,
  totalUnits: optInt,
  bumiQuotaPct: z.coerce.number().int().min(0).max(100).optional().nullable(),
  bumiDiscountBp: optBp,
  rebatePackage: z.string().max(2000).optional().nullable(),
  developerCommissionBp: optBp,
  status: z.enum(PROJECT_STATUS).optional(),
  notes: z.string().max(4000).optional().nullable(),
});

const projectUpdateSchema = projectSchema.partial().extend({ id: z.string().uuid() });

const unitTypeSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().min(1).max(100),
  description: z.string().max(2000).optional().nullable(),
  builtUpSqft: optInt,
  bedrooms: optInt,
  bathrooms: optInt,
  carParks: optInt,
  listPrice: z.coerce.number().int().nonnegative(), // MYR cents
  nettPrice: optInt,
  totalUnits: optInt,
  sortOrder: optInt,
});

const unitTypeUpdateSchema = unitTypeSchema.partial().omit({ projectId: true }).extend({
  id: z.string().uuid(),
});

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

/* ---------- projects ---------- */

export async function createProject(input: unknown): Promise<ActionResult<Project>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = projectSchema.parse(input);

    const [row] = await db
      .insert(projects)
      .values({
        name: d.name,
        developer: d.developer || null,
        propertyType: d.propertyType ?? null,
        state: d.state,
        area: d.area,
        address: d.address || null,
        galleryAddress: d.galleryAddress || null,
        tenure: d.tenure ?? null,
        titleType: d.titleType ?? null,
        launchAt: toDate(d.launchAt),
        expectedVpAt: toDate(d.expectedVpAt),
        totalUnits: d.totalUnits ?? null,
        bumiQuotaPct: d.bumiQuotaPct ?? null,
        bumiDiscountBp: d.bumiDiscountBp ?? null,
        rebatePackage: d.rebatePackage || null,
        developerCommissionBp: d.developerCommissionBp ?? null,
        status: d.status ?? "open",
        notes: d.notes || null,
      })
      .returning();

    revalidatePath("/projects");
    return ok(row!);
  } catch (err) {
    return handle(err, "createProject");
  }
}

export async function updateProject(input: unknown): Promise<ActionResult<Project>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = projectUpdateSchema.parse(input);
    const existing = await getProjectById(d.id);
    if (!existing) return fail("Project not found.");

    // `undefined` means "not submitted, keep it"; `null` means "explicitly cleared".
    const keep = <T>(next: T | undefined, current: T): T => (next !== undefined ? next : current);

    const [row] = await db
      .update(projects)
      .set({
        name: d.name ?? existing.name,
        developer: keep(d.developer, existing.developer),
        propertyType: keep(d.propertyType, existing.propertyType),
        state: d.state ?? existing.state,
        area: d.area ?? existing.area,
        address: keep(d.address, existing.address),
        galleryAddress: keep(d.galleryAddress, existing.galleryAddress),
        tenure: keep(d.tenure, existing.tenure),
        titleType: keep(d.titleType, existing.titleType),
        launchAt: d.launchAt !== undefined ? toDate(d.launchAt) : existing.launchAt,
        expectedVpAt: d.expectedVpAt !== undefined ? toDate(d.expectedVpAt) : existing.expectedVpAt,
        totalUnits: keep(d.totalUnits, existing.totalUnits),
        bumiQuotaPct: keep(d.bumiQuotaPct, existing.bumiQuotaPct),
        bumiDiscountBp: keep(d.bumiDiscountBp, existing.bumiDiscountBp),
        rebatePackage: keep(d.rebatePackage, existing.rebatePackage),
        developerCommissionBp: keep(d.developerCommissionBp, existing.developerCommissionBp),
        status: d.status ?? existing.status,
        notes: keep(d.notes, existing.notes),
      })
      .where(eq(projects.id, d.id))
      .returning();

    revalidatePath("/projects");
    revalidatePath(`/projects/${d.id}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "updateProject");
  }
}

export async function changeProjectStatus(
  id: string,
  status: (typeof PROJECT_STATUS)[number],
): Promise<ActionResult<Project>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);
    z.enum(PROJECT_STATUS).parse(status);
    const existing = await getProjectById(id);
    if (!existing) return fail("Project not found.");
    const [row] = await db.update(projects).set({ status }).where(eq(projects.id, id)).returning();
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "changeProjectStatus");
  }
}

/** Soft-delete a project. Its unit types go with it, also softly. */
export async function deleteProject(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);
    const existing = await getProjectById(id);
    if (!existing) return fail("Project not found.");
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(projects).set({ deletedAt: now }).where(eq(projects.id, id));
      await tx
        .update(projectUnitTypes)
        .set({ deletedAt: now })
        .where(and(eq(projectUnitTypes.projectId, id), isNull(projectUnitTypes.deletedAt)));
    });
    revalidatePath("/projects");
  } catch (err) {
    return handle(err, "deleteProject");
  }
  redirect("/projects");
}

/* ---------- unit types ---------- */

export async function createUnitType(input: unknown): Promise<ActionResult<ProjectUnitType>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = unitTypeSchema.parse(input);
    const project = await getProjectById(d.projectId);
    if (!project) return fail("Project not found.");

    const [row] = await db
      .insert(projectUnitTypes)
      .values({
        projectId: d.projectId,
        label: d.label,
        description: d.description || null,
        builtUpSqft: d.builtUpSqft ?? null,
        bedrooms: d.bedrooms ?? null,
        bathrooms: d.bathrooms ?? null,
        carParks: d.carParks ?? null,
        listPrice: d.listPrice,
        nettPrice: d.nettPrice ?? null,
        totalUnits: d.totalUnits ?? null,
        sortOrder: d.sortOrder ?? 0,
      })
      .returning();

    revalidatePath(`/projects/${d.projectId}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "createUnitType");
  }
}

export async function updateUnitType(input: unknown): Promise<ActionResult<ProjectUnitType>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = unitTypeUpdateSchema.parse(input);
    const existing = await getUnitTypeById(d.id);
    if (!existing) return fail("Unit type not found.");

    const keep = <T>(next: T | undefined, current: T): T => (next !== undefined ? next : current);

    const [row] = await db
      .update(projectUnitTypes)
      .set({
        label: d.label ?? existing.label,
        description: keep(d.description, existing.description),
        builtUpSqft: keep(d.builtUpSqft, existing.builtUpSqft),
        bedrooms: keep(d.bedrooms, existing.bedrooms),
        bathrooms: keep(d.bathrooms, existing.bathrooms),
        carParks: keep(d.carParks, existing.carParks),
        listPrice: d.listPrice ?? existing.listPrice,
        nettPrice: keep(d.nettPrice, existing.nettPrice),
        totalUnits: keep(d.totalUnits, existing.totalUnits),
        sortOrder: d.sortOrder ?? existing.sortOrder,
      })
      .where(eq(projectUnitTypes.id, d.id))
      .returning();

    revalidatePath(`/projects/${existing.projectId}`);
    return ok(row!);
  } catch (err) {
    return handle(err, "updateUnitType");
  }
}

export async function deleteUnitType(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);
    const existing = await getUnitTypeById(id);
    if (!existing) return fail("Unit type not found.");
    await db.update(projectUnitTypes).set({ deletedAt: new Date() }).where(eq(projectUnitTypes.id, id));
    revalidatePath(`/projects/${existing.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "deleteUnitType");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to change projects.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
