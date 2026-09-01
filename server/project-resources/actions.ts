"use server";
/**
 * Publishing a project's sales kit.
 *
 * Permission split is deliberate and asymmetric: EVERY signed-in user reads a kit,
 * only managers and admins write to one. A sales kit that any agent can edit stops
 * being a source of truth the moment two people disagree about the current price
 * list — and the whole point of moving off the shared spreadsheet was to have one.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { projectResources, documents, projects } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireDbUser, isManagerOrAbove, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { acceptedType, DOCUMENT_TYPES } from "@/lib/uploads/sniff";
import { RESOURCE_CATEGORIES } from "@/lib/sales-kit";

/**
 * Kept under next.config.mjs's serverActions.bodySizeLimit (20 MB) with headroom for
 * multipart overhead. A brochure or photo gallery can exceed this: the fix for those
 * is a presigned direct-to-R2 upload so the bytes never touch the server at all, which
 * needs one new method on StorageProvider and a CORS rule on the bucket. Until then
 * this cap is honest about what actually works rather than optimistic about what does not.
 */
const MAX_BYTES = 15 * 1024 * 1024;

/** Only managers and admins publish. Agents read. */
async function requirePublisher() {
  const me = await requireDbUser();
  if (!isManagerOrAbove(me)) throw new AuthorizationError();
  return me;
}

const addSchema = z.object({
  projectId: z.string().uuid(),
  category: z.enum(RESOURCE_CATEGORIES),
  label: z.string().min(1).max(255),
  url: z.string().url().max(2000).optional().nullable(),
  value: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function addResource(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const d = addSchema.parse(input);
    const me = await requirePublisher();

    if (d.url && d.value) return fail("An item is a link or a value, not both.");

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, d.projectId), isNull(projects.deletedAt)));
    if (!project) return fail("Project not found.");

    // Append to the end of its own category rather than the kit as a whole, so adding
    // a form does not land it in the middle of the legal documents.
    const rows = (await db.execute(sql`
      select coalesce(max(sort_order), 0) + 1 as next
      from project_resources
      where project_id = ${d.projectId} and category = ${d.category} and deleted_at is null
    `)) as unknown as Array<{ next: number | string }>;

    const [row] = await db
      .insert(projectResources)
      .values({
        projectId: d.projectId,
        category: d.category,
        label: d.label.trim(),
        url: d.url?.trim() || null,
        value: d.value?.trim() || null,
        notes: d.notes?.trim() || null,
        sortOrder: Number(rows[0]?.next ?? 0),
        updatedBy: me.id,
      })
      .returning({ id: projectResources.id });

    revalidatePath(`/projects/${d.projectId}`);
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "addResource");
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(255).optional(),
  url: z.string().url().max(2000).optional().nullable(),
  value: z.string().max(2000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function updateResource(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = updateSchema.parse(input);
    const loaded = await loadResource(d.id);
    if (loaded.error) return loaded.error;

    await db
      .update(projectResources)
      .set({
        ...(d.label !== undefined ? { label: d.label.trim() } : {}),
        ...(d.url !== undefined ? { url: d.url?.trim() || null } : {}),
        ...(d.value !== undefined ? { value: d.value?.trim() || null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes?.trim() || null } : {}),
        updatedBy: loaded.me.id,
      })
      .where(eq(projectResources.id, d.id));

    revalidatePath(`/projects/${loaded.row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "updateResource");
  }
}

/**
 * Attach or replace the file on a kit item.
 *
 * The declared content type is the client's word for it; the bytes decide. Whatever
 * we store is what R2 serves back on a signed URL, so a file that claims to be a PDF
 * and is not must never reach storage under that type.
 */
export async function uploadResourceFile(formData: FormData): Promise<ActionResult<void>> {
  try {
    const id = z.string().uuid().parse(formData.get("id"));
    const loaded = await loadResource(id);
    if (loaded.error) return loaded.error;

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("No file provided.");
    if (file.size > MAX_BYTES) return fail("File exceeds 15 MB.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = acceptedType(bytes, DOCUMENT_TYPES);
    if (!sniffed) return fail("That file is not a PDF, Word document or image.");

    const key = `projects/${loaded.row.projectId}/kit/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    await storage.upload(key, bytes, sniffed);

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: "projects",
        entityId: loaded.row.projectId,
        storageKey: key,
        filename: file.name,
        mimeType: sniffed,
        size: file.size,
        uploadedBy: loaded.me.id,
      })
      .returning({ id: documents.id });

    const previousId = loaded.row.documentId;

    await db
      .update(projectResources)
      .set({ documentId: doc!.id, updatedBy: loaded.me.id })
      .where(eq(projectResources.id, id));

    // Only after the row points at the NEW file: if clearing up the old one fails, the
    // item still resolves, and an orphaned object costs pennies. The reverse order can
    // leave a kit item pointing at a file that no longer exists.
    if (previousId) await discardFile(previousId);

    revalidatePath(`/projects/${loaded.row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "uploadResourceFile");
  }
}

/**
 * A signed URL to read a kit item's file.
 *
 * Any signed-in user, by design — this is the read path agents use all day. The link
 * is short-lived and forces a download rather than rendering in the tab.
 */
export async function getResourceFileUrl(id: string): Promise<ActionResult<{ url: string }>> {
  try {
    await requireDbUser();
    const parsed = z.string().uuid().parse(id);

    const [row] = await db
      .select({ documentId: projectResources.documentId })
      .from(projectResources)
      .where(and(eq(projectResources.id, parsed), isNull(projectResources.deletedAt)));
    if (!row) return fail("Item not found.");
    if (!row.documentId) return fail("No file attached.");

    const [doc] = await db
      .select({ key: documents.storageKey, filename: documents.filename })
      .from(documents)
      .where(and(eq(documents.id, row.documentId), isNull(documents.deletedAt)));
    if (!doc) return fail("File not found.");

    return ok({ url: await storage.getSignedUrl(doc.key, undefined, doc.filename ?? "document") });
  } catch (err) {
    return handle(err, "getResourceFileUrl");
  }
}

export async function removeResource(id: string): Promise<ActionResult<void>> {
  try {
    const parsed = z.string().uuid().parse(id);
    const loaded = await loadResource(parsed);
    if (loaded.error) return loaded.error;

    await db
      .update(projectResources)
      .set({ deletedAt: new Date(), updatedBy: loaded.me.id })
      .where(eq(projectResources.id, parsed));

    if (loaded.row.documentId) await discardFile(loaded.row.documentId);

    revalidatePath(`/projects/${loaded.row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "removeResource");
  }
}

/**
 * Drop a file from storage and mark its row gone.
 *
 * Never throws: this is always cleanup after the thing that mattered already
 * succeeded, and failing the caller because an object could not be deleted would undo
 * a change the user can see for a reason they cannot.
 */
async function discardFile(documentId: string): Promise<void> {
  try {
    const [doc] = await db
      .select({ key: documents.storageKey })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (!doc) return;
    await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, documentId));
    await storage.delete(doc.key);
  } catch (err) {
    monitoring.captureException(err, { where: "discardFile", documentId });
  }
}

type Loaded<T> = { error: ActionResult<never>; ok?: undefined } | ({ error?: undefined; ok: true } & T);

/** Load a kit item the current user may publish to, or the failure to return. */
async function loadResource(
  id: string,
): Promise<Loaded<{ me: Awaited<ReturnType<typeof requireDbUser>>; row: typeof projectResources.$inferSelect }>> {
  const me = await requirePublisher();
  const [row] = await db
    .select()
    .from(projectResources)
    .where(and(eq(projectResources.id, id), isNull(projectResources.deletedAt)));
  if (!row) return { error: fail("Item not found.") };
  return { ok: true, me, row };
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("Only a manager or admin can change a sales kit.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
