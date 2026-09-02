import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningTopics, learningChapters, documents, users } from "@/lib/db/schema";
import { requireDbUser, isAdmin } from "@/lib/auth";
import type { User } from "@/lib/db/schema";

/**
 * Who may see which Learning Hub topics, and who may upload one.
 *
 * This is the whole security model for the feature, in one file, for the same reason
 * server/capture/ownership.ts is: a hand-written `and(eq(uploaderUserId, me.id))`
 * per query is how a topic meant for one team ends up visible to the whole agency —
 * the day somebody adds an eleventh query and forgets the clause.
 *
 * THE RULE, stated once so nothing re-derives it: an agent watches PUBLISHED topics
 * uploaded by their own upline — ONE level, users.team_lead_id, never a chain above
 * that (see server/users/hierarchy.ts for why depth is not wanted in this schema). A
 * draft is visible only to the person who uploaded it. This applies at the TOPIC
 * level — a chapter has no owner or status of its own, it inherits both from the
 * topic it belongs to, which is why every chapter query below joins back to
 * learning_topics rather than trusting a chapter id on its own.
 *
 * Reading and writing are asymmetric on purpose. `listVisibleTopics` gives an admin
 * every topic, draft included — that is oversight of what a Team Lead has put in
 * front of their team, not a credential the way an OAuth token in
 * capture/ownership.ts is, so there is no harm in an admin seeing a title. But
 * `requireMyTopic` and `requireMyChapter`, used by every WRITE (upload, edit,
 * publish, delete), have no admin override at all: a Team Lead's rough draft is
 * exactly the kind of thing they do not want someone else editing or publishing out
 * from under them.
 */

export type LearningChapterRow = {
  id: string;
  topicId: string;
  title: string;
  sortOrder: number;
  documentId: string | null;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
};

export type LearningTopicRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: Date;
  uploaderUserId: string;
  uploaderName: string;
  chapters: LearningChapterRow[];
};

/** Every topic the signed-in user may watch, newest first, each with its chapters. */
export async function listVisibleTopics(): Promise<LearningTopicRow[]> {
  const me = await requireDbUser();

  const topicSelect = {
    id: learningTopics.id,
    title: learningTopics.title,
    description: learningTopics.description,
    status: learningTopics.status,
    createdAt: learningTopics.createdAt,
    uploaderUserId: learningTopics.uploaderUserId,
    uploaderName: users.name,
  };
  const topicQuery = db.select(topicSelect).from(learningTopics).innerJoin(users, eq(learningTopics.uploaderUserId, users.id));

  const topicRows = isAdmin(me)
    ? await topicQuery.where(isNull(learningTopics.deletedAt)).orderBy(desc(learningTopics.createdAt))
    : await topicQuery
        .where(
          and(
            isNull(learningTopics.deletedAt),
            // Own uploads (any status) plus the upline's published ones — never a
            // chain above that, and never a downline's or a peer's.
            inArray(learningTopics.uploaderUserId, me.teamLeadId ? [me.id, me.teamLeadId] : [me.id]),
            or(eq(learningTopics.uploaderUserId, me.id), eq(learningTopics.status, "published")),
          ),
        )
        .orderBy(desc(learningTopics.createdAt));

  if (topicRows.length === 0) return [];

  const topicIds = topicRows.map((t) => t.id);
  const chapterRows = await db
    .select({
      id: learningChapters.id,
      topicId: learningChapters.topicId,
      title: learningChapters.title,
      sortOrder: learningChapters.sortOrder,
      documentId: learningChapters.documentId,
      filename: documents.filename,
      mimeType: documents.mimeType,
      size: documents.size,
    })
    .from(learningChapters)
    .leftJoin(documents, eq(learningChapters.documentId, documents.id))
    .where(and(inArray(learningChapters.topicId, topicIds), isNull(learningChapters.deletedAt)))
    .orderBy(asc(learningChapters.sortOrder));

  const byTopic = new Map<string, LearningChapterRow[]>();
  for (const c of chapterRows) {
    const list = byTopic.get(c.topicId) ?? [];
    list.push(c);
    byTopic.set(c.topicId, list);
  }

  return topicRows.map((t) => ({ ...t, chapters: byTopic.get(t.id) ?? [] }));
}

/** How many topics this user has uploaded (draft + published) — the "My Uploads" count. */
export async function countMyUploads(me: User): Promise<number> {
  const rows = await db
    .select({ id: learningTopics.id })
    .from(learningTopics)
    .where(and(eq(learningTopics.uploaderUserId, me.id), isNull(learningTopics.deletedAt)));
  return rows.length;
}

/**
 * The same rule `listVisibleTopics` applies in SQL, restated as a predicate for a
 * SINGLE already-loaded topic — used by getChapterVideoUrl so a stale tab or a
 * shared link can never outlive the access rule just because it once had an id.
 */
export function canWatchTopic(
  me: User,
  topic: { uploaderUserId: string; status: string },
): boolean {
  if (isAdmin(me)) return true;
  if (topic.uploaderUserId === me.id) return true;
  return topic.status === "published" && topic.uploaderUserId === me.teamLeadId;
}

/** Team Leads and admins upload; agents watch only. */
export function canUploadLearning(user: User): boolean {
  return user.role === "admin" || user.role === "team_lead";
}

export class LearningNotFoundError extends Error {
  constructor() {
    // User-facing, so it must not hint that the row exists and belongs to someone else.
    super("That topic does not exist.");
    this.name = "LearningNotFoundError";
  }
}

/**
 * One topic by id, IF the signed-in user is the one who uploaded it — the only
 * person allowed to change it. Throws `LearningNotFoundError` both for an id that
 * does not exist and for one that belongs to somebody else, so the two cases are
 * indistinguishable to the caller by design (see the module docblock).
 */
export async function requireMyTopic(
  topicId: string,
): Promise<{ me: User; row: typeof learningTopics.$inferSelect }> {
  const me = await requireDbUser();
  const [row] = await db
    .select()
    .from(learningTopics)
    .where(and(eq(learningTopics.id, topicId), isNull(learningTopics.deletedAt)));
  if (!row || row.uploaderUserId !== me.id) throw new LearningNotFoundError();
  return { me, row };
}

/**
 * One chapter by id, IF the signed-in user owns the TOPIC it belongs to — a
 * chapter is never independently owned. Same not-found-vs-forbidden reasoning as
 * `requireMyTopic`.
 */
export async function requireMyChapter(chapterId: string): Promise<{
  me: User;
  chapter: typeof learningChapters.$inferSelect;
  topic: typeof learningTopics.$inferSelect;
}> {
  const me = await requireDbUser();
  const [row] = await db
    .select({ chapter: learningChapters, topic: learningTopics })
    .from(learningChapters)
    .innerJoin(learningTopics, eq(learningChapters.topicId, learningTopics.id))
    .where(
      and(
        eq(learningChapters.id, chapterId),
        isNull(learningChapters.deletedAt),
        isNull(learningTopics.deletedAt),
      ),
    );
  if (!row || row.topic.uploaderUserId !== me.id) throw new LearningNotFoundError();
  return { me, chapter: row.chapter, topic: row.topic };
}
