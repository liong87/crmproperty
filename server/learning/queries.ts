import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  learningTopics,
  learningChapters,
  learningAttachments,
  learningProgress,
  users,
} from "@/lib/db/schema";
import { storage } from "@/lib/storage";
import { requireVisibleTopic, visibleOwnerIds, visibleTopicsFilter, myTeam } from "./access";
import type { User } from "@/lib/db/schema";

export interface TopicCard {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  ownerName: string;
  isPublished: boolean;
  chapters: number;
  /** Total across chapters that reported one. Null when none did. */
  durationSeconds: number | null;
  watched: number;
  /** watched / chapters, or null for a topic with no chapters yet. */
  progress: number | null;
}

/**
 * The library grid.
 *
 * One query for the topics, one for the per-topic counts. Deliberately not a query per
 * card: a Worker is billed on CPU, and this app has already been knocked over twice by
 * doing N round trips where one would do.
 */
export async function listLibrary(user: User): Promise<TopicCard[]> {
  const ownerIds = await visibleOwnerIds(user);

  const topics = await db
    .select({
      id: learningTopics.id,
      title: learningTopics.title,
      summary: learningTopics.summary,
      category: learningTopics.category,
      isPublished: learningTopics.isPublished,
      ownerName: users.name,
    })
    .from(learningTopics)
    .innerJoin(users, eq(learningTopics.ownerUserId, users.id))
    .where(visibleTopicsFilter(user, ownerIds))
    .orderBy(asc(learningTopics.title));

  if (topics.length === 0) return [];

  const ids = topics.map((t) => t.id);

  const counts = await db
    .select({
      topicId: learningChapters.topicId,
      chapters: sql<number>`count(*)::int`,
      duration: sql<number>`coalesce(sum(${learningChapters.durationSeconds}), 0)::int`,
      watched: sql<number>`count(*) filter (where lp.id is not null)::int`,
    })
    .from(learningChapters)
    // The join carries the viewer's id, so "watched" is THIS person's progress rather
    // than everyone's — a left join without it would count the whole team's rows.
    .leftJoin(
      sql`learning_progress lp`,
      sql`lp.chapter_id = ${learningChapters.id} and lp.user_id = ${user.id} and lp.deleted_at is null`,
    )
    .where(and(inArray(learningChapters.topicId, ids), isNull(learningChapters.deletedAt)))
    .groupBy(learningChapters.topicId);

  const byTopic = new Map(counts.map((c) => [c.topicId, c]));

  return topics.map((t) => {
    const c = byTopic.get(t.id);
    const chapters = c?.chapters ?? 0;
    return {
      ...t,
      ownerName: t.ownerName ?? "—",
      chapters,
      durationSeconds: c && c.duration > 0 ? c.duration : null,
      watched: c?.watched ?? 0,
      progress: chapters > 0 ? (c?.watched ?? 0) / chapters : null,
    };
  });
}

export interface ChapterView {
  id: string;
  position: number;
  title: string;
  durationSeconds: number | null;
  videoKind: string;
  /** A playable URL: the link as given, or a short-lived signed R2 URL. */
  videoUrl: string;
  notes: string | null;
  watched: boolean;
  attachments: { id: string; filename: string }[];
}

export interface TopicDetail {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  ownerName: string;
  isPublished: boolean;
  canEdit: boolean;
  chapters: ChapterView[];
}

/**
 * One topic with its chapters, ready to play.
 *
 * Signed URLs are minted HERE, per request, and never stored. A stored signed URL is a
 * bearer token with an expiry nobody is tracking — anyone it reaches can fetch the
 * video until it lapses, whether or not they can sign in.
 */
export async function getTopic(user: User, topicId: string): Promise<TopicDetail> {
  const topic = await requireVisibleTopic(user, topicId);

  const [owner] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, topic.ownerUserId));

  const chapters = await db
    .select()
    .from(learningChapters)
    .where(and(eq(learningChapters.topicId, topicId), isNull(learningChapters.deletedAt)))
    .orderBy(asc(learningChapters.position), asc(learningChapters.createdAt));

  const chapterIds = chapters.map((c) => c.id);

  const [progress, attachments] = await Promise.all([
    chapterIds.length > 0
      ? db
          .select({ chapterId: learningProgress.chapterId })
          .from(learningProgress)
          .where(
            and(
              eq(learningProgress.userId, user.id),
              inArray(learningProgress.chapterId, chapterIds),
              isNull(learningProgress.deletedAt),
            ),
          )
      : Promise.resolve([]),
    chapterIds.length > 0
      ? db
          .select()
          .from(learningAttachments)
          .where(
            and(
              inArray(learningAttachments.chapterId, chapterIds),
              isNull(learningAttachments.deletedAt),
            ),
          )
      : Promise.resolve([]),
  ]);

  const watched = new Set(progress.map((p) => p.chapterId));
  const filesByChapter = new Map<string, { id: string; filename: string }[]>();
  for (const a of attachments) {
    const list = filesByChapter.get(a.chapterId) ?? [];
    list.push({ id: a.id, filename: a.filename });
    filesByChapter.set(a.chapterId, list);
  }

  const views: ChapterView[] = [];
  for (const c of chapters) {
    views.push({
      id: c.id,
      position: c.position,
      title: c.title,
      durationSeconds: c.durationSeconds,
      videoKind: c.videoKind,
      videoUrl:
        c.videoKind === "file"
          ? await storage.getSignedUrl(c.videoUrlOrKey, 3600)
          : c.videoUrlOrKey,
      notes: c.notes,
      watched: watched.has(c.id),
      attachments: filesByChapter.get(c.id) ?? [],
    });
  }

  return {
    id: topic.id,
    title: topic.title,
    summary: topic.summary,
    category: topic.category,
    ownerName: owner?.name ?? "—",
    isPublished: topic.isPublished,
    // Reading and writing are different questions; see access.ts. An admin may be here
    // reading somebody else's published topic and must not get an edit button.
    canEdit: topic.ownerUserId === user.id,
    chapters: views,
  };
}

/** Every topic this leader owns, drafts included. Their My Uploads screen. */
export async function listMyTopics(user: User): Promise<TopicCard[]> {
  const all = await listLibrary(user);
  const mine = await db
    .select({ id: learningTopics.id })
    .from(learningTopics)
    .where(and(eq(learningTopics.ownerUserId, user.id), isNull(learningTopics.deletedAt)));
  const ids = new Set(mine.map((m) => m.id));
  return all.filter((t) => ids.has(t.id));
}

export interface TeamProgressRow {
  agentId: string;
  name: string;
  /** topic id → completed fraction, 0..1. Null when the topic has no chapters. */
  byTopic: Record<string, number | null>;
  overall: number | null;
}

export interface TeamProgressData {
  topics: { id: string; title: string; chapters: number }[];
  rows: TeamProgressRow[];
}

/**
 * Every agent against every one of this leader's published topics.
 *
 * Drafts are excluded: reporting somebody as 0% on training they were never shown
 * would be a number a manager acts on, and it would be wrong.
 */
export async function getTeamProgress(user: User): Promise<TeamProgressData> {
  const [team, topics] = await Promise.all([
    myTeam(user),
    db
      .select({ id: learningTopics.id, title: learningTopics.title })
      .from(learningTopics)
      .where(
        and(
          eq(learningTopics.ownerUserId, user.id),
          eq(learningTopics.isPublished, true),
          isNull(learningTopics.deletedAt),
        ),
      )
      .orderBy(asc(learningTopics.title)),
  ]);

  if (team.length === 0 || topics.length === 0) {
    return { topics: topics.map((t) => ({ ...t, chapters: 0 })), rows: [] };
  }

  const topicIds = topics.map((t) => t.id);

  const chapters = await db
    .select({ id: learningChapters.id, topicId: learningChapters.topicId })
    .from(learningChapters)
    .where(and(inArray(learningChapters.topicId, topicIds), isNull(learningChapters.deletedAt)));

  const chaptersPerTopic = new Map<string, string[]>();
  for (const c of chapters) {
    const list = chaptersPerTopic.get(c.topicId) ?? [];
    list.push(c.id);
    chaptersPerTopic.set(c.topicId, list);
  }

  const done =
    chapters.length > 0
      ? await db
          .select({ userId: learningProgress.userId, chapterId: learningProgress.chapterId })
          .from(learningProgress)
          .where(
            and(
              inArray(
                learningProgress.userId,
                team.map((t) => t.id),
              ),
              inArray(
                learningProgress.chapterId,
                chapters.map((c) => c.id),
              ),
              isNull(learningProgress.deletedAt),
            ),
          )
      : [];

  const watchedBy = new Map<string, Set<string>>();
  for (const d of done) {
    const set = watchedBy.get(d.userId) ?? new Set<string>();
    set.add(d.chapterId);
    watchedBy.set(d.userId, set);
  }

  const rows: TeamProgressRow[] = team.map((agent) => {
    const seen = watchedBy.get(agent.id) ?? new Set<string>();
    const byTopic: Record<string, number | null> = {};
    let total = 0;
    let completed = 0;

    for (const t of topics) {
      const ids = chaptersPerTopic.get(t.id) ?? [];
      if (ids.length === 0) {
        byTopic[t.id] = null;
        continue;
      }
      const n = ids.filter((id) => seen.has(id)).length;
      byTopic[t.id] = n / ids.length;
      total += ids.length;
      completed += n;
    }

    return { agentId: agent.id, name: agent.name, byTopic, overall: total > 0 ? completed / total : null };
  });

  return {
    topics: topics.map((t) => ({ ...t, chapters: (chaptersPerTopic.get(t.id) ?? []).length })),
    rows,
  };
}

/** Who has watched a given topic — the panel on the topic page, for its owner. */
export async function whoHasWatched(
  user: User,
  topicId: string,
): Promise<{ name: string; watched: number; total: number }[]> {
  const topic = await requireVisibleTopic(user, topicId);
  if (topic.ownerUserId !== user.id) return [];

  const [team, chapters] = await Promise.all([
    myTeam(user),
    db
      .select({ id: learningChapters.id })
      .from(learningChapters)
      .where(and(eq(learningChapters.topicId, topicId), isNull(learningChapters.deletedAt))),
  ]);

  if (team.length === 0 || chapters.length === 0) {
    return team.map((t) => ({ name: t.name, watched: 0, total: chapters.length }));
  }

  const done = await db
    .select({ userId: learningProgress.userId })
    .from(learningProgress)
    .where(
      and(
        inArray(
          learningProgress.userId,
          team.map((t) => t.id),
        ),
        inArray(
          learningProgress.chapterId,
          chapters.map((c) => c.id),
        ),
        isNull(learningProgress.deletedAt),
      ),
    );

  const counts = new Map<string, number>();
  for (const d of done) counts.set(d.userId, (counts.get(d.userId) ?? 0) + 1);

  return team.map((t) => ({
    name: t.name,
    watched: counts.get(t.id) ?? 0,
    total: chapters.length,
  }));
}
