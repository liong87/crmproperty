"use server";
/** Deal mutations. A deal REQUIRES a contact (never a lead). RBAC + Zod + ActionResult. */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { DEAL_TYPE } from "@/lib/constants";
import { deals, dealStages, contacts, activities, type Deal } from "@/lib/db/schema";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { instantiateChecklist } from "@/server/deal-documents/checklist-internal";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getDealById } from "./queries";

const createSchema = z.object({
  contactId: z.string().uuid(),
  propertyId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional(),
  value: z.coerce.number().int().nonnegative().optional().nullable(),
  commissionPct: z.coerce.number().int().min(0).max(10000).optional().nullable(), // basis points
  projectId: z.string().uuid().optional().nullable(),
  dealType: z.enum(DEAL_TYPE).optional(),
});

export async function createDeal(input: unknown): Promise<ActionResult<Deal>> {
  try {
    const me = await requireDbUser();
    const d = createSchema.parse(input);

    // A deal requires an existing contact.
    const [contact] = await db
      .select({ id: contacts.id, assignedTo: contacts.assignedTo })
      .from(contacts)
      .where(and(eq(contacts.id, d.contactId), isNull(contacts.deletedAt)));
    if (!contact) return fail("Contact not found — a deal must be linked to a contact.");
    assertCanEdit(me, contact.assignedTo);

    // A deal against a project is a project deal even if the caller did not say so —
    // inferring it here stops a booked unit landing in the resale pipeline because a
    // form forgot a hidden field.
    const dealType = d.dealType ?? (d.projectId ? "project" : "resale");
    const pipeline = dealType === "project" ? "project" : "resale";

    // Default to the first (lowest sort_order) stage OF THAT PIPELINE if none provided.
    let stageId = d.stageId;
    if (!stageId) {
      const [first] = await db
        .select({ id: dealStages.id })
        .from(dealStages)
        .where(and(isNull(dealStages.deletedAt), eq(dealStages.pipeline, pipeline)))
        .orderBy(dealStages.sortOrder)
        .limit(1);
      if (!first) {
        return fail(
          pipeline === "project"
            ? "No project stages configured. Run the migrations to seed them."
            : "No deal stages configured.",
        );
      }
      stageId = first.id;
    }

    const [row] = await db
      .insert(deals)
      .values({
        contactId: d.contactId,
        propertyId: d.propertyId ?? null,
        projectId: d.projectId ?? null,
        dealType,
        stageId,
        value: d.value ?? null,
        commissionPct: d.commissionPct ?? null,
        assignedTo: contact.assignedTo ?? me.id,
      })
      .returning();

    await db.insert(activities).values({
      entityType: "deals",
      entityId: row!.id,
      type: "note",
      body: `Deal created by ${me.name}.`,
      createdBy: me.id,
    });

    // The paperwork checklist for this pipeline. Best-effort by design — a deal that
    // exists without its checklist is recoverable; failing creation over a template
    // row is not what anyone wants at that moment.
    await instantiateChecklist(row!.id, pipeline);

    revalidatePath("/pipeline");
    return ok(row!);
  } catch (err) {
    return handle(err, "createDeal");
  }
}

export async function moveDealStage(dealId: string, stageId: string): Promise<ActionResult<Deal>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(dealId);
    z.string().uuid().parse(stageId);

    const deal = await getDealById(dealId);
    if (!deal) return fail("Deal not found.");
    assertCanEdit(me, deal.assignedTo);

    const [stage] = await db
      .select({ id: dealStages.id, name: dealStages.name })
      .from(dealStages)
      .where(and(eq(dealStages.id, stageId), isNull(dealStages.deletedAt)));
    if (!stage) return fail("Stage not found.");

    const [row] = await db.update(deals).set({ stageId }).where(eq(deals.id, dealId)).returning();

    await db.insert(activities).values({
      entityType: "deals",
      entityId: dealId,
      type: "note",
      body: `Moved to "${stage.name}" by ${me.name}.`,
      createdBy: me.id,
    });

    revalidatePath("/pipeline");
    return ok(row!);
  } catch (err) {
    return handle(err, "moveDealStage");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail(err.message);
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
