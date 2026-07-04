"use server";
/**
 * Property image uploads via the storage adapter (never the S3 SDK directly).
 * documents rows store `storage_key` only — signed URLs are generated at read time,
 * so switching R2 -> S3/B2/MinIO needs no data migration.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { documents, type Document } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireDbUser, assertCanEdit, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { getPropertyById } from "./queries";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export interface PropertyImage {
  id: string;
  filename: string;
  url: string; // signed, temporary
}

/** Upload one image. Expects FormData with `propertyId` and `file`. */
export async function uploadPropertyImage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const propertyId = z.string().uuid().parse(formData.get("propertyId"));
    const property = await getPropertyById(propertyId);
    if (!property) return fail("Property not found.");
    assertCanEdit(me, property.assignedAgent);

    const file = formData.get("file");
    if (!(file instanceof File)) return fail("No file provided.");
    if (file.size > MAX_BYTES) return fail("Image exceeds 8 MB.");
    if (!ALLOWED.includes(file.type)) return fail("Only JPEG, PNG, or WebP allowed.");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const key = `properties/${propertyId}/${crypto.randomUUID()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    await storage.upload(key, bytes, file.type);

    const [row] = await db
      .insert(documents)
      .values({
        entityType: "properties",
        entityId: propertyId,
        storageKey: key,
        filename: safeName,
        mimeType: file.type,
        size: file.size,
        uploadedBy: me.id,
      })
      .returning({ id: documents.id });

    revalidatePath(`/properties/${propertyId}`);
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "uploadPropertyImage");
  }
}

export async function deletePropertyImage(documentId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(documentId);
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) return fail("Image not found.");
    const property = await getPropertyById(doc.entityId);
    if (property) assertCanEdit(me, property.assignedAgent);

    await storage.delete(doc.storageKey);
    await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, documentId));

    revalidatePath(`/properties/${doc.entityId}`);
    return ok(undefined);
  } catch (err) {
    return handle(err, "deletePropertyImage");
  }
}

/** List images for a property with fresh signed URLs. */
export async function listPropertyImages(propertyId: string): Promise<PropertyImage[]> {
  const rows: Document[] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.entityType, "properties"),
        eq(documents.entityId, propertyId),
        isNull(documents.deletedAt),
      ),
    );

  const withUrls = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      filename: d.filename,
      url: await storage.getSignedUrl(d.storageKey, 3600),
    })),
  );
  return withUrls;
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail(err.message);
  if (err instanceof z.ZodError) return fail("Invalid input.");
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Upload failed.");
}
