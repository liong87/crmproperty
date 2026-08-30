"use server";
/**
 * Commission: configuring schemes, and computing a deal's commission from one.
 *
 * Scheme configuration is manager and admin only — it decides what everybody is paid.
 * A deal's commission follows the DEAL's owner, the same rule the pipeline uses, so an
 * agent can see and record their own without being able to change the agency's rates.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  commissionSchemes, commissionSchemeStages, dealCommissions, dealCommissionStages,
  dealCommissionSplits, deals, projects, appointments, users, contacts,
} from "@/lib/db/schema";
import { requireDbUser, assertRole, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import {
  grossCommission, releaseStages, splitCommission, validateSplit, validateStages,
  type SplitInput,
} from "./calc";

const bp = z.coerce.number().int().min(0).max(10_000);

const stageSchema = z.object({
  label: z.string().min(1).max(120),
  releaseBp: bp,
  dueDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
});

const schemeSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  developerBp: bp.nullable().optional(),
  agencyBp: bp,
  setterBp: bp,
  closerBp: bp,
  coBrokeBp: bp,
  isDefault: z.boolean().optional(),
  stages: z.array(stageSchema).min(1).max(12),
});

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to do that.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}

/* ------------------------------------------------------------------ schemes */

export async function saveScheme(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    const d = schemeSchema.parse(input);

    // Both totals are checked here rather than by a constraint: a table constraint
    // cannot see a row's siblings, and the caller deserves the arithmetic in the error.
    const splitProblem = validateSplit(d);
    if (splitProblem) return fail(splitProblem);
    const stageProblem = validateStages(d.stages);
    if (stageProblem) return fail(stageProblem);

    const values = {
      name: d.name,
      description: d.description ?? null,
      developerBp: d.developerBp ?? null,
      agencyBp: d.agencyBp,
      setterBp: d.setterBp,
      closerBp: d.closerBp,
      coBrokeBp: d.coBrokeBp,
      isDefault: d.isDefault ?? false,
    };

    // Only one scheme may be the default. Cleared first, because the partial unique
    // index would otherwise reject the write rather than replacing the old default.
    if (values.isDefault) {
      await db
        .update(commissionSchemes)
        .set({ isDefault: false })
        .where(and(eq(commissionSchemes.isDefault, true), isNull(commissionSchemes.deletedAt)));
    }

    let schemeId = d.id;
    if (schemeId) {
      const [row] = await db
        .update(commissionSchemes)
        .set(values)
        .where(and(eq(commissionSchemes.id, schemeId), isNull(commissionSchemes.deletedAt)))
        .returning({ id: commissionSchemes.id });
      if (!row) return fail("Scheme not found.");
      // Stages are replaced wholesale. They are configuration, not history — a deal's
      // own stages are snapshots, so nothing already agreed is disturbed by this.
      await db
        .update(commissionSchemeStages)
        .set({ deletedAt: new Date() })
        .where(and(
          eq(commissionSchemeStages.schemeId, schemeId),
          isNull(commissionSchemeStages.deletedAt),
        ));
    } else {
      const [row] = await db
        .insert(commissionSchemes)
        .values(values)
        .returning({ id: commissionSchemes.id });
      schemeId = row!.id;
    }

    await db.insert(commissionSchemeStages).values(
      d.stages.map((s, i) => ({
        schemeId: schemeId!,
        label: s.label,
        releaseBp: s.releaseBp,
        dueDays: s.dueDays ?? null,
        sortOrder: i,
      })),
    );

    revalidatePath("/settings/commission");
    return ok({ id: schemeId! });
  } catch (err) {
    return handle(err, "saveScheme");
  }
}

export async function deleteScheme(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);

    const [row] = await db
      .select({ isDefault: commissionSchemes.isDefault })
      .from(commissionSchemes)
      .where(and(eq(commissionSchemes.id, id), isNull(commissionSchemes.deletedAt)));
    if (!row) return fail("Scheme not found.");
    if (row.isDefault) {
      return fail("That is the default scheme. Make another one the default first.");
    }

    await db
      .update(commissionSchemes)
      .set({ deletedAt: new Date() })
      .where(eq(commissionSchemes.id, id));

    revalidatePath("/settings/commission");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "deleteScheme");
  }
}

/* ------------------------------------------------------- a deal's commission */

const createSchema = z.object({
  dealId: z.string().uuid(),
  schemeId: z.string().uuid(),
  /** MYR cents. Defaults to the deal's value when omitted. */
  baseAmount: z.coerce.number().int().min(0).optional(),
  /** Overrides the scheme's and the project's rate, for a one-off agreement. */
  developerBp: bp.optional(),
  setterId: z.string().uuid().nullable().optional(),
  closerId: z.string().uuid().nullable().optional(),
  coBrokeName: z.string().max(255).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Build a deal's commission from a scheme.
 *
 * Everything is SNAPSHOTTED: rates, amounts, names. Editing the scheme afterwards
 * changes nothing here, because an agent who was told what a booking would earn them
 * should not find it quietly restated.
 */
export async function createDealCommission(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const d = createSchema.parse(input);

    const [deal] = await db
      .select({
        id: deals.id,
        value: deals.value,
        assignedTo: deals.assignedTo,
        projectId: deals.projectId,
      })
      .from(deals)
      .where(and(eq(deals.id, d.dealId), isNull(deals.deletedAt)));
    if (!deal) return fail("Deal not found.");
    assertCanEdit(me, deal.assignedTo);

    const [existing] = await db
      .select({ id: dealCommissions.id })
      .from(dealCommissions)
      .where(and(eq(dealCommissions.dealId, d.dealId), isNull(dealCommissions.deletedAt)));
    if (existing) return fail("This deal already has a commission. Remove it first to rebuild it.");

    const [scheme] = await db
      .select()
      .from(commissionSchemes)
      .where(and(eq(commissionSchemes.id, d.schemeId), isNull(commissionSchemes.deletedAt)));
    if (!scheme) return fail("Commission scheme not found.");

    const stages = await db
      .select()
      .from(commissionSchemeStages)
      .where(and(
        eq(commissionSchemeStages.schemeId, scheme.id),
        isNull(commissionSchemeStages.deletedAt),
      ))
      .orderBy(commissionSchemeStages.sortOrder);
    const stageProblem = validateStages(stages);
    if (stageProblem) return fail(`This scheme is not usable yet — ${stageProblem}`);

    // Rate precedence, most specific first: an explicit override, then the scheme's own
    // rate, then the project's. The project is the usual source, because the rate is
    // the developer's while the split is the agency's.
    let developerBp = d.developerBp ?? scheme.developerBp ?? null;
    if (developerBp == null && deal.projectId) {
      const [project] = await db
        .select({ bp: projects.developerCommissionBp })
        .from(projects)
        .where(eq(projects.id, deal.projectId));
      developerBp = project?.bp ?? null;
    }
    if (developerBp == null) {
      return fail("No commission rate. Set one on the project, on the scheme, or here.");
    }

    const baseAmount = d.baseAmount ?? deal.value ?? 0;
    if (baseAmount <= 0) return fail("The deal has no value to calculate a commission on.");

    // Who earned it. Taken from the booked appointment where there is one, because that
    // is where the setter and closer were actually recorded, and overridable because the
    // agency's agreement can legitimately differ.
    let setterId = d.setterId ?? null;
    let closerId = d.closerId ?? null;
    if (setterId === null && closerId === null && deal.projectId) {
      const [booked] = await db
        .select({ assignedTo: appointments.assignedTo, closerId: appointments.closerId })
        .from(appointments)
        .where(and(
          eq(appointments.projectId, deal.projectId),
          eq(appointments.outcome, "booked"),
          isNull(appointments.deletedAt),
        ))
        .limit(1);
      if (booked) {
        setterId = booked.assignedTo;
        closerId = booked.closerId ?? booked.assignedTo;
      }
    }
    setterId = setterId ?? deal.assignedTo;
    closerId = closerId ?? setterId;

    const gross = grossCommission(baseAmount, developerBp);

    const [commission] = await db
      .insert(dealCommissions)
      .values({
        dealId: d.dealId,
        schemeId: scheme.id,
        schemeName: scheme.name,
        baseAmount,
        developerBp,
        grossAmount: gross,
        setterId,
        closerId,
        coBrokeName: d.coBrokeName ?? null,
        notes: d.notes ?? null,
        createdBy: me.id,
      })
      .returning({ id: dealCommissions.id });

    const commissionId = commission!.id;

    // Names are resolved now and stored on the split, so a statement still reads
    // correctly after somebody leaves and their user row is deactivated.
    const ids = [setterId, closerId].filter((x): x is string => x != null);
    const staff = ids.length
      ? await db.select({ id: users.id, name: users.name }).from(users).where(
          isNull(users.deletedAt),
        )
      : [];
    const nameOf = (uid: string | null) =>
      staff.find((u) => u.id === uid)?.name ?? "Unassigned";

    // The setter and the closer being the same person is the common case. Merging their
    // shares avoids a statement that lists one person twice for the same booking.
    const sameParty = setterId != null && setterId === closerId;
    const parties: SplitInput[] = sameParty
      ? [
          { party: "agency", label: "Agency", shareBp: scheme.agencyBp },
          {
            party: "setter",
            label: nameOf(setterId),
            userId: setterId,
            shareBp: scheme.setterBp + scheme.closerBp,
          },
          { party: "co-broke", label: d.coBrokeName ?? "Co-broke", shareBp: scheme.coBrokeBp },
        ]
      : [
          { party: "agency", label: "Agency", shareBp: scheme.agencyBp },
          { party: "setter", label: nameOf(setterId), userId: setterId, shareBp: scheme.setterBp },
          { party: "closer", label: nameOf(closerId), userId: closerId, shareBp: scheme.closerBp },
          { party: "co-broke", label: d.coBrokeName ?? "Co-broke", shareBp: scheme.coBrokeBp },
        ];

    const splits = splitCommission(gross, parties);
    if (splits.length > 0) {
      await db.insert(dealCommissionSplits).values(
        splits.map((s) => ({
          dealCommissionId: commissionId,
          party: s.party,
          userId: s.userId ?? null,
          label: s.label,
          shareBp: s.shareBp,
          amount: s.amount,
        })),
      );
    }

    const today = Date.now();
    const released = releaseStages(gross, stages.map((s, i) => ({
      label: s.label,
      releaseBp: s.releaseBp,
      dueDays: s.dueDays,
      sortOrder: i,
    })));

    await db.insert(dealCommissionStages).values(
      released.map((s) => ({
        dealCommissionId: commissionId,
        label: s.label,
        releaseBp: s.releaseBp,
        amount: s.amount,
        // Suggested only, and editable. Counted in Malaysia time so a date entered as
        // "90 days" lands on the day the agency would call day 90.
        expectedAt:
          s.dueDays != null
            ? new Date(
                Math.floor((today + MY_OFFSET_MS) / 86_400_000) * 86_400_000
                  - MY_OFFSET_MS
                  + s.dueDays * 86_400_000,
              )
            : null,
        sortOrder: s.sortOrder,
      })),
    );

    revalidatePath(`/deals/${d.dealId}`);
    revalidatePath("/reports/commission");
    return ok({ id: commissionId });
  } catch (err) {
    return handle(err, "createDealCommission");
  }
}

const stageUpdateSchema = z.object({
  id: z.string().uuid(),
  expectedAt: z.string().nullable().optional(),
  invoicedAt: z.string().nullable().optional(),
  receivedAt: z.string().nullable().optional(),
});

const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);

/** Record that a stage was billed, or that the money arrived. */
export async function updateCommissionStage(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = stageUpdateSchema.parse(input);

    const [row] = await db
      .select({
        stageId: dealCommissionStages.id,
        dealId: dealCommissions.dealId,
        assignedTo: deals.assignedTo,
        invoicedAt: dealCommissionStages.invoicedAt,
        receivedAt: dealCommissionStages.receivedAt,
      })
      .from(dealCommissionStages)
      .innerJoin(dealCommissions, eq(dealCommissions.id, dealCommissionStages.dealCommissionId))
      .innerJoin(deals, eq(deals.id, dealCommissions.dealId))
      .where(and(eq(dealCommissionStages.id, d.id), isNull(dealCommissionStages.deletedAt)));
    if (!row) return fail("Stage not found.");
    assertCanEdit(me, row.assignedTo);

    const invoicedAt = d.invoicedAt !== undefined ? toDate(d.invoicedAt) : row.invoicedAt;
    const receivedAt = d.receivedAt !== undefined ? toDate(d.receivedAt) : row.receivedAt;

    // The table has the same rule, but catching it here gives a sentence rather than a
    // constraint violation.
    if (receivedAt && invoicedAt && receivedAt < invoicedAt) {
      return fail("Money cannot be received before it was invoiced.");
    }

    await db
      .update(dealCommissionStages)
      .set({
        ...(d.expectedAt !== undefined ? { expectedAt: toDate(d.expectedAt) } : {}),
        invoicedAt,
        receivedAt,
      })
      .where(eq(dealCommissionStages.id, d.id));

    revalidatePath(`/deals/${row.dealId}`);
    revalidatePath("/reports/commission");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "updateCommissionStage");
  }
}

/** Remove a deal's commission so it can be rebuilt — e.g. after the price changed. */
export async function deleteDealCommission(dealId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(dealId);

    const [deal] = await db
      .select({ assignedTo: deals.assignedTo })
      .from(deals)
      .where(and(eq(deals.id, dealId), isNull(deals.deletedAt)));
    if (!deal) return fail("Deal not found.");
    assertCanEdit(me, deal.assignedTo);

    const now = new Date();
    const [row] = await db
      .update(dealCommissions)
      .set({ deletedAt: now })
      .where(and(eq(dealCommissions.dealId, dealId), isNull(dealCommissions.deletedAt)))
      .returning({ id: dealCommissions.id });
    if (!row) return fail("This deal has no commission.");

    // Children go too, so a rebuild does not resurrect old stages alongside new ones.
    await db.update(dealCommissionStages).set({ deletedAt: now })
      .where(eq(dealCommissionStages.dealCommissionId, row.id));
    await db.update(dealCommissionSplits).set({ deletedAt: now })
      .where(eq(dealCommissionSplits.dealCommissionId, row.id));

    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/reports/commission");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "deleteDealCommission");
  }
}
