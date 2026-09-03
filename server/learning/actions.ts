"use server";

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  learningTopics,
  learningChapters,
  learningAttachments,
  learningProgress,
} from "@/lib/db/schema";
import { requireDbUser } from "@/lib/auth";
import { storage } from "@/lib/storage";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import {
  canOwnTopics,
  requireOwnedTopic,
  requireVisibleTopic,
  NotATopicOwnerError,
  TopicNotFoundError,
} from "./access";

function asFailure(err: unknown): ActionResult<never> {
  if (err instanceof TopicNotFoundError) return fail("That topic does not exist.");
  if (err instanceof NotATopicOwnerError) return fail("Only a team leader can publish training.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  monitoring.captureException(err, { where: "learning:action" });
  return fail((err as Error).message || "Something went wrong.");
}

const topicSchema = z.object({
  title: z.string().min(1, "A title is needed.").max(255),
  summary: z.string().max(2000).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  visibility: z.enum(["team"]).default("team"),
});

export async function createTopic(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    if (!canOwnTopics(me)) throw new NotATopicOwnerError();
    const d = topicSchema.parse(input);

    const [row] = await db
      .insert(learningTopics)
      .values({
        ownerUserId: me.id,
        title: d.title.trim(),
        summary: d.summary?.trim() || null,
        category: d.category?.trim() || null,
        visibility: d.visibility,
        // Always a draft. Publishing is a separate, deliberate act — a topic with no
        // chapters appearing in the team's library is worse than no topic at all.
        isPublished: false,
      })
      .returning({ id: learningTopics.id });

    revalidatePath("/learning");
    return ok({ id: row!.id });
  } catch (err) {
    return asFailure(err);
  }
}

export async function updateTopic(
  topicId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    await requireOwnedTopic(me, topicId);
    const d = topicSchema.partial().parse(input);

    await db
      .update(learningTopics)
      .set({
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.summary !== undefined ? { summary: d.summary?.trim() || null } : {}),
        ...(d.category !== undefined ? { category: d.category?.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(learningTopics.id, topicId));

    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Publish or unpublish.
 *
 * Publishing an empty topic is refused rather than allowed-and-warned: the agents see
 * it the moment it flips, and "0 chapters" in their library reads as the CRM being
 * broken rather than the leader being mid-way through.
 */
export async function setPublished(topicId: string, published: boolean): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    await requireOwnedTopic(me, topicId);

    if (published) {
      const [counted] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(learningChapters)
        .where(and(eq(learningChapters.topicId, topicId), isNull(learningChapters.deletedAt)));
      if ((counted?.n ?? 0) === 0) return fail("Add at least one chapter before publishing this to your team.");
    }

    await db
      .update(learningTopics)
      .set({ isPublished: published, updatedAt: new Date() })
      .where(eq(learningTopics.id, topicId));

    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

export async function deleteTopic(topicId: string): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    await requireOwnedTopic(me, topicId);
    // Soft delete: progress rows reference the chapters, and "who watched what" is
    // worth keeping even once the material is retired.
    await db
      .update(learningTopics)
      .set({ deletedAt: new Date(), isPublished: false })
      .where(eq(learningTopics.id, topicId));
    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

const chapterSchema = z.object({
  title: z.string().min(1, "A chapter title is needed.").max(255),
  videoKind: z.enum(["link", "file"]),
  videoUrlOrKey: z.string().min(1, "A video link or upload is needed."),
  notes: z.string().max(20000).optional().nullable(),
  durationSeconds: z.number().int().positive().max(86_400).optional().nullable(),
});

export async function addChapter(topicId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    await requireOwnedTopic(me, topicId);
    const d = chapterSchema.parse(input);

    if (d.videoKind === "link" && !/^https:\/\//i.test(d.videoUrlOrKey)) {
      // http:// would be blocked as mixed content inside the player and look like a
      // broken video rather than a rejected link.
      return fail("A video link must start with https://");
    }

    const [ordering] = await db
      .select({ next: sql<number>`coalesce(max(${learningChapters.position}), -1) + 1` })
      .from(learningChapters)
      .where(and(eq(learningChapters.topicId, topicId), isNull(learningChapters.deletedAt)));

    const [row] = await db
      .insert(learningChapters)
      .values({
        topicId,
        position: ordering?.next ?? 0,
        title: d.title.trim(),
        videoKind: d.videoKind,
        videoUrlOrKey: d.videoUrlOrKey,
        notes: d.notes?.trim() || null,
        durationSeconds: d.durationSeconds ?? null,
      })
      .returning({ id: learningChapters.id });

    revalidatePath("/learning");
    return ok({ id: row!.id });
  } catch (err) {
    return asFailure(err);
  }
}

export async function updateChapter(chapterId: string, input: unknown): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    const [chapter] = await db
      .select()
      .from(learningChapters)
      .where(and(eq(learningChapters.id, chapterId), isNull(learningChapters.deletedAt)))
      .limit(1);
    if (!chapter) throw new TopicNotFoundError();
    await requireOwnedTopic(me, chapter.topicId); // ownership is on the TOPIC

    const d = chapterSchema.partial().parse(input);
    await db
      .update(learningChapters)
      .set({
        ...(d.title !== undefined ? { title: d.title.trim() } : {}),
        ...(d.notes !== undefined ? { notes: d.notes?.trim() || null } : {}),
        ...(d.durationSeconds !== undefined ? { durationSeconds: d.durationSeconds ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(learningChapters.id, chapterId));

    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

export async function deleteChapter(chapterId: string): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    const [chapter] = await db
      .select()
      .from(learningChapters)
      .where(and(eq(learningChapters.id, chapterId), isNull(learningChapters.deletedAt)))
      .limit(1);
    if (!chapter) throw new TopicNotFoundError();
    await requireOwnedTopic(me, chapter.topicId);

    await db
      .update(learningChapters)
      .set({ deletedAt: new Date() })
      .where(eq(learningChapters.id, chapterId));
    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * A presigned PUT so the browser uploads the video straight to R2.
 *
 * The bytes never touch the Worker, and that is not an optimisation: a Worker's CPU
 * budget cannot receive, buffer and re-upload a training video, and trying is how you
 * get Error 1102 on a file somebody waited ten minutes to send.
 *
 * The content type is signed INTO the URL, so the holder can only store an object of
 * that exact type. The key is server-chosen — never taken from the client — because a
 * client-supplied key is a path-traversal waiting to overwrite somebody else's object.
 */
export async function createUploadUrl(
  topicId: string,
  filename: string,
  contentType: string,
): Promise<ActionResult<{ uploadUrl: string; key: string }>> {
  try {
    const me = await requireDbUser();
    await requireOwnedTopic(me, topicId);

    if (!/^(video|audio|application|image|text)\//.test(contentType)) {
      return fail("That file type cannot be uploaded.");
    }

    const safeExt = (filename.match(/\.[A-Za-z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
    const key = `learning/${topicId}/${crypto.randomUUID()}${safeExt}`;

    return ok({ uploadUrl: await storage.getUploadUrl(key, contentType, 900), key });
  } catch (err) {
    return asFailure(err);
  }
}

export async function addAttachment(
  chapterId: string,
  filename: string,
  storageKey: string,
  sizeBytes?: number,
): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    const [chapter] = await db
      .select()
      .from(learningChapters)
      .where(and(eq(learningChapters.id, chapterId), isNull(learningChapters.deletedAt)))
      .limit(1);
    if (!chapter) throw new TopicNotFoundError();
    await requireOwnedTopic(me, chapter.topicId);

    await db.insert(learningAttachments).values({
      chapterId,
      filename: filename.slice(0, 255),
      storageKey,
      sizeBytes: sizeBytes ?? null,
    });
    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}

/** A short-lived download link for an attachment, for anyone who can see the topic. */
export async function attachmentUrl(attachmentId: string): Promise<ActionResult<{ url: string }>> {
  try {
    const me = await requireDbUser();
    const [row] = await db
      .select({ file: learningAttachments, topicId: learningChapters.topicId })
      .from(learningAttachments)
      .innerJoin(learningChapters, eq(learningAttachments.chapterId, learningChapters.id))
      .where(and(eq(learningAttachments.id, attachmentId), isNull(learningAttachments.deletedAt)))
      .limit(1);
    if (!row) throw new TopicNotFoundError();

    // Read permission comes from the TOPIC, not from holding the attachment id.
    await requireVisibleTopic(me, row.topicId);

    return ok({ url: await storage.getSignedUrl(row.file.storageKey, 300, row.file.filename) });
  } catch (err) {
    return asFailure(err);
  }
}

/**
 * Mark a chapter watched.
 *
 * Idempotent by the unique index on (user_id, chapter_id): a double click, or the same
 * person on a second device, must not produce two rows and a progress bar over 100%.
 */
export async function markWatched(chapterId: string, watched = true): Promise<ActionResult<null>> {
  try {
    const me = await requireDbUser();
    const [chapter] = await db
      .select({ topicId: learningChapters.topicId })
      .from(learningChapters)
      .where(and(eq(learningChapters.id, chapterId), isNull(learningChapters.deletedAt)))
      .limit(1);
    if (!chapter) throw new TopicNotFoundError();

    // You can only record progress on something you are allowed to watch.
    await requireVisibleTopic(me, chapter.topicId);

    if (watched) {
      await db
        .insert(learningProgress)
        .values({ userId: me.id, chapterId })
        .onConflictDoNothing({
          target: [learningProgress.userId, learningProgress.chapterId],
        });
    } else {
      await db
        .delete(learningProgress)
        .where(
          and(eq(learningProgress.userId, me.id), eq(learningProgress.chapterId, chapterId)),
        );
    }

    revalidatePath("/learning");
    return ok(null);
  } catch (err) {
    return asFailure(err);
  }
}
