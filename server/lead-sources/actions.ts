"use server";
/**
 * Lead form source mappings.
 *
 * Admin and manager only: a mapping decides which project a paid lead lands in, and
 * therefore whose funnel and whose budget it counts against.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leadFormSources, type LeadFormSource } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { INTEREST } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getLeadFormSourceById } from "./queries";

const PROVIDERS = ["meta", "tally", "typeform", "googleads", "generic"] as const;

const baseSchema = z.object({
  provider: z.enum(PROVIDERS),
  externalFormId: z.string().min(1).max(255),
  label: z.string().min(1).max(255),
  projectId: z.string().uuid().optional().nullable(),
  defaultInterest: z.enum(INTEREST).optional().nullable(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateSchema = baseSchema.partial().extend({ id: z.string().uuid() });

export async function createLeadFormSource(input: unknown): Promise<ActionResult<LeadFormSource>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const d = baseSchema.parse(input);

    // Checked here as well as by the unique index, so the user gets a sentence rather
    // than a constraint violation.
    const [clash] = await db
      .select({ id: leadFormSources.id })
      .from(leadFormSources)
      .where(
        and(
          eq(leadFormSources.provider, d.provider),
          eq(leadFormSources.externalFormId, d.externalFormId.trim()),
          isNull(leadFormSources.deletedAt),
        ),
      );
    if (clash) return fail("That form is already mapped. Edit the existing mapping instead.");

    const [row] = await db
      .insert(leadFormSources)
      .values({
        provider: d.provider,
        externalFormId: d.externalFormId.trim(),
        label: d.label.trim(),
        projectId: d.projectId ?? null,
        defaultInterest: d.defaultInterest ?? null,
        active: d.active ?? true,
        notes: d.notes || null,
      })
      .returning();

    revalidatePath("/leads-capture");
    return ok(row!);
  } catch (err) {
    return handle(err, "createLeadFormSource");
  }
}

export async function updateLeadFormSource(input: unknown): Promise<ActionResult<LeadFormSource>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const d = updateSchema.parse(input);
    const existing = await getLeadFormSourceById(d.id);
    if (!existing) return fail("Mapping not found.");

    const keep = <T>(next: T | undefined, current: T): T => (next !== undefined ? next : current);

    const [row] = await db
      .update(leadFormSources)
      .set({
        label: d.label?.trim() ?? existing.label,
        projectId: keep(d.projectId, existing.projectId),
        defaultInterest: keep(d.defaultInterest, existing.defaultInterest),
        active: d.active ?? existing.active,
        notes: keep(d.notes, existing.notes),
      })
      .where(eq(leadFormSources.id, d.id))
      .returning();

    revalidatePath("/leads-capture");
    return ok(row!);
  } catch (err) {
    return handle(err, "updateLeadFormSource");
  }
}

export async function deleteLeadFormSource(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    z.string().uuid().parse(id);
    const existing = await getLeadFormSourceById(id);
    if (!existing) return fail("Mapping not found.");
    await db.update(leadFormSources).set({ deletedAt: new Date() }).where(eq(leadFormSources.id, id));
    revalidatePath("/leads-capture");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "deleteLeadFormSource");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to change lead sources.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
