"use server";
/**
 * Publishing a project's sales kit.
 *
 * Permission split is deliberate and asymmetric: EVERY signed-in user reads a kit,
 * only team leads and admins write to one. A sales kit that any agent can edit stops
 * being a source of truth the moment two people disagree about the current price
 * list — and the whole point of moving off the shared spreadsheet was to have one.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { projectResources, documents, projects } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireDbUser, isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { RESOURCE_CATEGORIES } from "@/lib/sales-kit";


/** Only team leads and admins publish. Agents read. */
async function requirePublisher() {
  const me = await requireDbUser();
  if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
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
 * Direct-to-storage upload, in two steps: mint a presigned PUT, then record what
 * landed. The bytes go browser -> R2 and never touch the server.
 *
 * This exists because the server-action path (uploadResourceFile above) cannot carry
 * a real sales kit. An e-brochure or photo gallery is tens of megabytes, and on
 * Cloudflare Workers' free plan a request gets 10 ms of CPU — nowhere near enough to
 * buffer and re-upload a file that size. Signing a URL costs almost nothing.
 *
 * THE TRADE-OFF, STATED PLAINLY: because the bytes never reach us, we cannot sniff
 * magic bytes the way uploadResourceFile does, so the declared content type is taken
 * on trust. Four things contain that:
 *   1. The type is signed INTO the presigned URL, so the stored object can only ever
 *      have the type we allowed — a caller cannot promise PDF and store HTML.
 *   2. Only an allowlisted type is signed at all.
 *   3. Reads always go out as `attachment` + application/octet-stream (see
 *      getSignedUrl), so nothing is ever rendered in our origin.
 *   4. X-Content-Type-Options: nosniff is set globally in next.config.mjs.
 * The residual risk is a manager storing a mislabelled file that a colleague later
 * downloads and opens deliberately — the same risk as any shared drive, and strictly
 * smaller than the Google Drive folder this replaces.
 */

/** What a sales kit legitimately contains. Price lists are very often spreadsheets. */
const UPLOAD_TYPES: Record<string, true> = {
  "application/pdf": true,
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
  "application/msword": true,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
  "application/vnd.ms-excel": true,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
};

/** Generous, because this path exists for brochures and galleries. R2 takes 5 GB in one PUT. */
const MAX_DIRECT_BYTES = 200 * 1024 * 1024;

const startSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DIRECT_BYTES),
});

export async function createResourceUploadUrl(
  input: unknown,
): Promise<ActionResult<{ url: string; key: string }>> {
  try {
    const d = startSchema.parse(input);
    const loaded = await loadResource(d.id);
    if (loaded.error) return loaded.error;

    if (!UPLOAD_TYPES[d.contentType]) {
      return fail("Upload a PDF, Word document, spreadsheet or image.");
    }

    const safeName = d.filename.replace(/[^\w.\-]/g, "_").slice(0, 120);
    const key = `projects/${loaded.row.projectId}/kit/${crypto.randomUUID()}-${safeName}`;

    return ok({ url: await storage.getUploadUrl(key, d.contentType), key });
  } catch (err) {
    return handle(err, "createResourceUploadUrl");
  }
}

const confirmSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DIRECT_BYTES),
});

/** Record an upload that has already landed in storage, and point the item at it. */
export async function confirmResourceUpload(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = confirmSchema.parse(input);
    const loaded = await loadResource(d.id);
    if (loaded.error) return loaded.error;

    if (!UPLOAD_TYPES[d.contentType]) return fail("Unsupported file type.");

    // The key came back from the client, so re-derive what it is allowed to look like
    // rather than trusting it. Without this, a caller could point a kit item at any
    // object in the bucket — including another project's, or a database backup if the
    // buckets were ever merged.
    const expected = new RegExp(
      `^projects/${loaded.row.projectId}/kit/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-`,
    );
    if (!expected.test(d.key)) return fail("That upload does not belong to this project.");

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: "projects",
        entityId: loaded.row.projectId,
        storageKey: d.key,
        filename: d.filename,
        mimeType: d.contentType,
        size: d.size,
        uploadedBy: loaded.me.id,
      })
      .returning({ id: documents.id });

    const previousId = loaded.row.documentId;

    await db
      .update(projectResources)
      .set({ documentId: doc!.id, updatedBy: loaded.me.id })
      .where(eq(projectResources.id, d.id));

    if (previousId) await discardFile(previousId);

    revalidatePath(`/projects/${loaded.row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "confirmResourceUpload");
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
