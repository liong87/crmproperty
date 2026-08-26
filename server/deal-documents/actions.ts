"use server";
/**
 * Deal paperwork: the checklist, its deadlines and the files attached to it.
 *
 * Permission follows the DEAL's owner, the same rule the pipeline board uses.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { dealDocuments, documentRequirements, deals, documents } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — an SPA scan is bigger than a photo.
const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

type Loaded<T> = { error: ActionResult<never>; ok?: undefined } | ({ error?: undefined; ok: true } & T);

/** Load a deal the current user may change, or the failure to return. */
async function loadEditableDeal(
  id: string,
): Promise<Loaded<{ me: Awaited<ReturnType<typeof requireDbUser>>; deal: typeof deals.$inferSelect }>> {
  const me = await requireDbUser();
  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  if (!deal) return { error: fail("Deal not found.") };
  assertCanEdit(me, deal.assignedTo);
  return { ok: true, me, deal };
}

/**
 * Create the checklist for a new deal from its pipeline's template.
 *
 * Called from createDeal. Never throws into the caller: a deal that exists without its
 * checklist is recoverable (the items can be added), whereas failing the whole creation
 * because a template row was malformed is not what anybody wants at that moment.
 */
export async function instantiateChecklist(dealId: string, pipeline: string): Promise<void> {
  try {
    // Idempotent. A second call would silently double every line, and a checklist
    // showing "Loan approval letter" twice is one nobody trusts or finishes.
    const [existing] = await db
      .select({ id: dealDocuments.id })
      .from(dealDocuments)
      .where(and(eq(dealDocuments.dealId, dealId), isNull(dealDocuments.deletedAt)))
      .limit(1);
    if (existing) return;

    const template = await db
      .select()
      .from(documentRequirements)
      .where(and(eq(documentRequirements.pipeline, pipeline), isNull(documentRequirements.deletedAt)));
    if (template.length === 0) return;

    const now = Date.now();
    await db.insert(dealDocuments).values(
      template.map((t) => ({
        dealId,
        requirementId: t.id,
        label: t.label,
        required: t.required,
        sortOrder: t.sortOrder,
        // A suggested date only. The one that matters — a loan approval's expiry — is
        // printed on the letter and gets typed in when it arrives.
        dueAt: t.dueAfterDays != null ? new Date(now + t.dueAfterDays * 86_400_000) : null,
      })),
    );
  } catch (err) {
    monitoring.captureException(err, { where: "instantiateChecklist", dealId, pipeline });
  }
}

const addSchema = z.object({
  dealId: z.string().uuid(),
  label: z.string().min(1).max(255),
  required: z.boolean().optional(),
  dueAt: z.string().datetime().optional().nullable(),
});

export async function addChecklistItem(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = addSchema.parse(input);
    const loaded = await loadEditableDeal(d.dealId);
    if (loaded.error) return loaded.error;

    const orderRows = (await db.execute(sql`
      select coalesce(max(sort_order), 0) + 1 as next
      from deal_documents where deal_id = ${d.dealId} and deleted_at is null
    `)) as unknown as Array<{ next: number | string }>;
    const next = Number(orderRows[0]?.next ?? 0);

    await db.insert(dealDocuments).values({
      dealId: d.dealId,
      label: d.label.trim(),
      required: d.required ?? false,
      sortOrder: next,
      dueAt: d.dueAt ? new Date(d.dueAt) : null,
    });

    revalidatePath(`/deals/${d.dealId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "addChecklistItem");
  }
}

const dueSchema = z.object({
  id: z.string().uuid(),
  dueAt: z.string().datetime().optional().nullable(),
});

/** Set or clear an item's deadline. This is where a loan approval's expiry gets typed in. */
export async function setChecklistDue(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = dueSchema.parse(input);
    const item = await loadItem(d.id);
    if (item.error) return item.error;

    await db
      .update(dealDocuments)
      .set({ dueAt: d.dueAt ? new Date(d.dueAt) : null })
      .where(eq(dealDocuments.id, d.id));

    revalidatePath(`/deals/${item.row.dealId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "setChecklistDue");
  }
}

export async function setChecklistDone(id: string, done: boolean): Promise<ActionResult<void>> {
  try {
    z.string().uuid().parse(id);
    const item = await loadItem(id);
    if (item.error) return item.error;

    await db
      .update(dealDocuments)
      .set({
        completedAt: done ? new Date() : null,
        completedBy: done ? item.me.id : null,
      })
      .where(eq(dealDocuments.id, id));

    revalidatePath(`/deals/${item.row.dealId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "setChecklistDone");
  }
}

export async function removeChecklistItem(id: string): Promise<ActionResult<void>> {
  try {
    z.string().uuid().parse(id);
    const item = await loadItem(id);
    if (item.error) return item.error;
    await db.update(dealDocuments).set({ deletedAt: new Date() }).where(eq(dealDocuments.id, id));
    revalidatePath(`/deals/${item.row.dealId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "removeChecklistItem");
  }
}

/**
 * Attach a file to a checklist item.
 *
 * Goes through the storage adapter and stores the key only, never a provider URL, so
 * moving between R2 / S3 / B2 needs no data migration. Same rule as property photos.
 */
export async function uploadChecklistFile(formData: FormData): Promise<ActionResult<void>> {
  try {
    const itemId = z.string().uuid().parse(formData.get("itemId"));
    const item = await loadItem(itemId);
    if (item.error) return item.error;

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("No file provided.");
    if (file.size > MAX_BYTES) return fail("File exceeds 15 MB.");
    if (!ALLOWED.includes(file.type)) return fail("Upload a PDF, Word document or image.");

    const key = `deals/${item.row.dealId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    await storage.upload(key, new Uint8Array(await file.arrayBuffer()), file.type);

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: "deals",
        entityId: item.row.dealId,
        storageKey: key,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        uploadedBy: item.me.id,
      })
      .returning({ id: documents.id });

    // Attaching the file does NOT tick the item. Someone still has to confirm the
    // document is the right one and in order, which is the point of the checklist.
    await db.update(dealDocuments).set({ documentId: doc!.id }).where(eq(dealDocuments.id, itemId));

    revalidatePath(`/deals/${item.row.dealId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "uploadChecklistFile");
  }
}

/** A signed, temporary URL for an attached file. */
export async function getChecklistFileUrl(itemId: string): Promise<ActionResult<{ url: string }>> {
  try {
    z.string().uuid().parse(itemId);
    const item = await loadItem(itemId);
    if (item.error) return item.error;
    if (!item.row.documentId) return fail("No file attached.");

    const [doc] = await db
      .select({ key: documents.storageKey })
      .from(documents)
      .where(eq(documents.id, item.row.documentId));
    if (!doc) return fail("File not found.");

    return ok({ url: await storage.getSignedUrl(doc.key) });
  } catch (err) {
    return handle(err, "getChecklistFileUrl");
  }
}

async function loadItem(
  id: string,
): Promise<Loaded<{ me: Awaited<ReturnType<typeof requireDbUser>>; row: typeof dealDocuments.$inferSelect }>> {
  const me = await requireDbUser();
  const [row] = await db
    .select()
    .from(dealDocuments)
    .where(and(eq(dealDocuments.id, id), isNull(dealDocuments.deletedAt)));
  if (!row) return { error: fail("Checklist item not found.") };

  const [deal] = await db.select().from(deals).where(eq(deals.id, row.dealId));
  if (!deal) return { error: fail("Deal not found.") };
  assertCanEdit(me, deal.assignedTo);
  return { ok: true, me, row };
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You can only change paperwork on your own deals.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
