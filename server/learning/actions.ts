"use server";
/**
 * Learning Hub: a Team Lead uploads training videos, grouped into topics with one
 * or more chapters, and their downline watches them.
 *
 * The upload is the same direct-to-storage shape as the sales kit
 * (server/project-resources/actions.ts): mint a presigned PUT, the browser sends the
 * bytes straight to R2, then this records what landed. Training videos are exactly
 * the file type that pattern exists for — a five-minute screen recording is already
 * tens of megabytes, nowhere near what a Worker's 10ms CPU budget can relay.
 *
 * Visibility and edit permission are NOT decided here — every function below defers
 * to server/learning/access.ts, which is the one place that logic is allowed to live.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { learningTopics, learningChapters, documents } from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireDbUser, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import {
  canUploadLearning, canWatchTopic, requireMyTopic, requireMyChapter, LearningNotFoundError,
} from "./access";

/** What a training video legitimately is. */
const UPLOAD_TYPES: Record<string, true> = {
  "video/mp4": true,
  "video/quicktime": true,
  "video/webm": true,
  "video/x-matroska": true,
};

/** Generous — a full role-play recording can run long. R2 takes 5 GB in one PUT. */
const MAX_DIRECT_BYTES = 1024 * 1024 * 1024; // 1 GB

async function requireUploader() {
  const me = await requireDbUser();
  if (!canUploadLearning(me)) throw new AuthorizationError();
  return me;
}

const createTopicSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(4000).optional().nullable(),
});

/** Create a topic shell. Chapters (each an uploaded video) are added to it next. */
export async function createTopic(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const d = createTopicSchema.parse(input);
    const me = await requireUploader();
    const [row] = await db
      .insert(learningTopics)
      .values({
        uploaderUserId: me.id,
        title: d.title.trim(),
        description: d.description?.trim() || null,
        status: "draft",
      })
      .returning({ id: learningTopics.id });
    revalidatePath("/learning");
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "createTopic");
  }
}

const editTopicSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(4000).optional().nullable(),
});

export async function updateTopic(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = editTopicSchema.parse(input);
    const { row } = await requireMyTopic(d.id);
    await db
      .update(learningTopics)
      .set({
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.description !== undefined ? { description: d.description?.trim() || null } : {}),
      })
      .where(eq(learningTopics.id, row.id));
    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "updateTopic");
  }
}

const createChapterSchema = z.object({
  topicId: z.string().uuid(),
  title: z.string().min(1).max(255),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DIRECT_BYTES),
});

/**
 * Start a chapter upload: create the chapter row (appended to the end of its
 * topic), and mint a presigned PUT for the video. The row exists before the bytes
 * land so the client has an id to confirm against, and a chapter title is never
 * lost even if the PUT itself never completes.
 */
export async function createChapterUploadUrl(
  input: unknown,
): Promise<ActionResult<{ chapterId: string; url: string; key: string }>> {
  try {
    const d = createChapterSchema.parse(input);
    const { me, row: topic } = await requireMyTopic(d.topicId);

    if (!UPLOAD_TYPES[d.contentType]) return fail("Upload an MP4, MOV, WebM or MKV video.");

    // Append to the end of THIS topic's chapters, same pattern as
    // dealDocuments.addChecklistItem — never the row count, which is wrong the
    // moment a chapter is ever removed.
    const orderRows = (await db.execute(sql`
      select coalesce(max(sort_order), -1) + 1 as next
      from learning_chapters where topic_id = ${topic.id} and deleted_at is null
    `)) as unknown as Array<{ next: number | string }>;

    const [chapter] = await db
      .insert(learningChapters)
      .values({ topicId: topic.id, title: d.title.trim(), sortOrder: Number(orderRows[0]?.next ?? 0) })
      .returning({ id: learningChapters.id });

    const safeName = d.filename.replace(/[^\w.\-]/g, "_").slice(0, 120);
    const key = `learning/${me.id}/${topic.id}/${chapter!.id}/${crypto.randomUUID()}-${safeName}`;

    return ok({ chapterId: chapter!.id, url: await storage.getUploadUrl(key, d.contentType), key });
  } catch (err) {
    return handle(err, "createChapterUploadUrl");
  }
}

const confirmChapterSchema = z.object({
  chapterId: z.string().uuid(),
  key: z.string().min(1).max(1024),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_DIRECT_BYTES),
});

/** Record the video that landed in storage against its chapter. Topic is still a draft. */
export async function confirmChapterUpload(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = confirmChapterSchema.parse(input);
    const { me, chapter, topic } = await requireMyChapter(d.chapterId);

    if (!UPLOAD_TYPES[d.contentType]) return fail("Unsupported video type.");

    // Re-derive the expected key rather than trust the one handed back — without
    // this a caller could point a chapter at any object already in the bucket.
    const expected = new RegExp(
      `^learning/${me.id}/${topic.id}/${chapter.id}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-`,
    );
    if (!expected.test(d.key)) return fail("That upload does not belong to this chapter.");

    const [doc] = await db
      .insert(documents)
      .values({
        entityType: "learning_chapters",
        entityId: chapter.id,
        storageKey: d.key,
        filename: d.filename,
        mimeType: d.contentType,
        size: d.size,
        uploadedBy: me.id,
      })
      .returning({ id: documents.id });

    const previousId = chapter.documentId;
    await db.update(learningChapters).set({ documentId: doc!.id }).where(eq(learningChapters.id, chapter.id));
    if (previousId) await discardFile(previousId);

    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "confirmChapterUpload");
  }
}

export async function removeChapter(chapterId: string): Promise<ActionResult<void>> {
  try {
    const parsed = z.string().uuid().parse(chapterId);
    const { chapter } = await requireMyChapter(parsed);
    await db.update(learningChapters).set({ deletedAt: new Date() }).where(eq(learningChapters.id, chapter.id));
    if (chapter.documentId) await discardFile(chapter.documentId);
    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "removeChapter");
  }
}

/** Make a topic visible to the downline. Requires at least one chapter with a video. */
export async function publishTopic(id: string): Promise<ActionResult<void>> {
  try {
    const parsed = z.string().uuid().parse(id);
    const { row } = await requireMyTopic(parsed);

    const chapters = await db
      .select({ documentId: learningChapters.documentId })
      .from(learningChapters)
      .where(and(eq(learningChapters.topicId, row.id), isNull(learningChapters.deletedAt)));
    if (!chapters.some((c) => c.documentId)) {
      return fail("Add at least one chapter with a video before publishing.");
    }

    await db.update(learningTopics).set({ status: "published" }).where(eq(learningTopics.id, row.id));
    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "publishTopic");
  }
}

/** Pull a topic back to draft — visible only to its uploader again. */
export async function unpublishTopic(id: string): Promise<ActionResult<void>> {
  try {
    const parsed = z.string().uuid().parse(id);
    const { row } = await requireMyTopic(parsed);
    await db.update(learningTopics).set({ status: "draft" }).where(eq(learningTopics.id, row.id));
    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "unpublishTopic");
  }
}

/**
 * Remove a topic and every one of its chapters. Chapters are soft-deleted and
 * their files discarded explicitly here rather than relying on the DB's ON DELETE
 * CASCADE on learning_chapters.topic_id — that cascade only fires on a hard
 * delete, and this app never hard-deletes anything.
 */
export async function removeTopic(id: string): Promise<ActionResult<void>> {
  try {
    const parsed = z.string().uuid().parse(id);
    const { row } = await requireMyTopic(parsed);

    const chapters = await db
      .select({ id: learningChapters.id, documentId: learningChapters.documentId })
      .from(learningChapters)
      .where(and(eq(learningChapters.topicId, row.id), isNull(learningChapters.deletedAt)));

    await db.update(learningTopics).set({ deletedAt: new Date() }).where(eq(learningTopics.id, row.id));
    for (const c of chapters) {
      await db.update(learningChapters).set({ deletedAt: new Date() }).where(eq(learningChapters.id, c.id));
      if (c.documentId) await discardFile(c.documentId);
    }

    revalidatePath("/learning");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "removeTopic");
  }
}

/**
 * A signed URL to STREAM one chapter's video.
 *
 * No `downloadAs`: unlike a contract or identity document, a training video is meant
 * to render inline in a <video> element, so the object's real content-type is left
 * alone. An hour's expiry rather than the usual 15 minutes — a video actively
 * playing keeps re-requesting byte ranges from the same URL, and a link expiring
 * mid-seek would stop playback for no reason a viewer could see.
 *
 * The chapter's PARENT TOPIC is re-loaded and re-checked against `canWatchTopic`
 * rather than trusting that an id the browser is holding was ever this user's to
 * see — a stale tab or a forwarded link must not outlive the access rule.
 */
export async function getChapterVideoUrl(chapterId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const parsed = z.string().uuid().parse(chapterId);
    const me = await requireDbUser();

    const [row] = await db
      .select({
        documentId: learningChapters.documentId,
        topicStatus: learningTopics.status,
        topicUploaderId: learningTopics.uploaderUserId,
      })
      .from(learningChapters)
      .innerJoin(learningTopics, eq(learningChapters.topicId, learningTopics.id))
      .where(
        and(
          eq(learningChapters.id, parsed),
          isNull(learningChapters.deletedAt),
          isNull(learningTopics.deletedAt),
        ),
      );
    if (!row || !canWatchTopic(me, { uploaderUserId: row.topicUploaderId, status: row.topicStatus })) {
      return fail("Video not found.");
    }
    if (!row.documentId) return fail("No video attached.");

    const [doc] = await db.select({ key: documents.storageKey }).from(documents).where(eq(documents.id, row.documentId));
    if (!doc) return fail("Video not found.");

    return ok({ url: await storage.getSignedUrl(doc.key, 3600) });
  } catch (err) {
    return handle(err, "getChapterVideoUrl");
  }
}

/**
 * Drop a file from storage and mark its row gone. Never throws: this is always
 * cleanup after the thing that mattered already succeeded.
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

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("Only a Team Lead or admin can manage Learning Hub uploads.");
  if (err instanceof LearningNotFoundError) return fail(err.message);
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
