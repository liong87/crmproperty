/**
 * Opening a deal, with the authorization decision left to the caller.
 *
 * WHY THIS FILE EXISTS, AND WHY IT MUST NOT GAIN A "use server" DIRECTIVE:
 *
 * Every export of a `"use server"` module becomes a browser-callable RPC endpoint as
 * soon as any Client Component imports anything from that module. `openDeal` inserts a
 * deal against any contact without asking who is calling, because its callers have
 * already decided that. Same rule as `remarks-internal.ts` and `checklist-internal.ts`.
 *
 * WHY IT IS SEPARATE FROM `createDeal`:
 *
 * `createDeal` authorises against the CONTACT's owner, which is right for the New Deal
 * form. A deal is now also opened as a consequence of booking an appointment, and
 * appointments authorise on the setter *or the closer* — so a closer who takes a
 * deposit on a colleague's client would fail the contact test and the deal would
 * silently not open. Booking the unit is the authorization; that rule is different from
 * the form's, and it is written down here rather than inherited by accident.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deals, dealStages, activities, type Deal, type User } from "@/lib/db/schema";
import { instantiateChecklist } from "@/server/deal-documents/checklist-internal";

export interface OpenDealInput {
  contactId: string;
  projectId?: string | null;
  propertyId?: string | null;
  /** project | resale. Inferred from projectId when omitted. */
  dealType?: string;
  /** Falls back to the contact's owner, resolved by the caller. */
  assignedTo: string | null;
  value?: number | null;
  commissionPct?: number | null;
  /** Explicit stage, or the first stage of the pipeline when omitted. */
  stageId?: string;
}

/**
 * Insert a deal, seed its paperwork checklist, and note it on the timeline.
 *
 * CALLER MUST HAVE AUTHORISED THE WRITE. There is no check here.
 *
 * Returns null when the pipeline has no stages configured — a deal cannot exist without
 * one, and the caller decides whether that is an error to show or a best-effort skip.
 */
export async function openDeal(input: OpenDealInput, me: User): Promise<Deal | null> {
  // A deal against a project is a project deal even if the caller did not say so.
  // Inferring it here stops a booked unit landing in the resale pipeline because a
  // form forgot a hidden field.
  const dealType = input.dealType ?? (input.projectId ? "project" : "resale");
  const pipeline = dealType === "project" ? "project" : "resale";

  let stageId = input.stageId;
  if (!stageId) {
    const [first] = await db
      .select({ id: dealStages.id })
      .from(dealStages)
      .where(and(isNull(dealStages.deletedAt), eq(dealStages.pipeline, pipeline)))
      .orderBy(dealStages.sortOrder)
      .limit(1);
    if (!first) return null;
    stageId = first.id;
  }

  const [row] = await db
    .insert(deals)
    .values({
      contactId: input.contactId,
      propertyId: input.propertyId ?? null,
      projectId: input.projectId ?? null,
      dealType,
      stageId,
      value: input.value ?? null,
      commissionPct: input.commissionPct ?? null,
      assignedTo: input.assignedTo ?? me.id,
    })
    .returning();

  if (!row) return null;

  await db.insert(activities).values({
    entityType: "deals",
    entityId: row.id,
    type: "note",
    body: `Deal created by ${me.name}.`,
    createdBy: me.id,
  });

  // Best-effort by design — a deal that exists without its checklist is recoverable;
  // failing creation over a template row is not what anyone wants at that moment.
  await instantiateChecklist(row.id, pipeline);

  return row;
}
