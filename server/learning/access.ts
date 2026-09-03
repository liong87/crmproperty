import { and, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { learningTopics, users } from "@/lib/db/schema";
import type { LearningTopic, User } from "@/lib/db/schema";

/**
 * Who can see which training topics, decided in exactly one place.
 *
 * The rule, in full:
 *
 *   - A LEADER (team_lead or admin) writes only topics where `owner_user_id` is their
 *     own id. There is no "edit anyone's" path, not even for an admin: training is
 *     somebody's teaching, and an admin quietly rewriting a team lead's chapter is a
 *     worse failure than an admin being unable to.
 *   - An AGENT reads only PUBLISHED topics owned by their upline — `users.team_lead_id`,
 *     one level. They write nothing.
 *   - A leader also reads their own DRAFTS, because otherwise they cannot review what
 *     they are about to publish.
 *
 * This lives in one helper rather than as an `AND` clause per query for the same
 * reason capture ownership does (server/capture/ownership.ts): the eleventh query is
 * the one that forgets, and the failure is silent — an agent seeing a draft, or another
 * team's material, with nothing throwing.
 */

export class TopicNotFoundError extends Error {
  constructor() {
    // Deliberately indistinguishable from "does not exist". A "forbidden" would
    // confirm the topic is real and belongs to someone, which is information an agent
    // has no business having.
    super("That topic does not exist.");
    this.name = "TopicNotFoundError";
  }
}

export class NotATopicOwnerError extends Error {
  constructor() {
    super("Only a team leader can publish training.");
    this.name = "NotATopicOwnerError";
  }
}

/** Team leads and admins own training. Agents consume it. */
export function canOwnTopics(user: User): boolean {
  return user.role === "admin" || user.role === "team_lead";
}

/**
 * The people whose published topics this user may read.
 *
 * An agent gets their upline. A leader gets themselves — a leader with no upline still
 * has their own material, and one WITH an upline gets both, because a team lead is
 * usually also somebody's agent.
 */
export async function visibleOwnerIds(user: User): Promise<string[]> {
  const ids = new Set<string>();
  if (canOwnTopics(user)) ids.add(user.id);
  if (user.teamLeadId) ids.add(user.teamLeadId);

  /*
   * An admin sees every leader's library. That is a deliberate exception and a narrow
   * one: it grants READING published training, which is company material by intent,
   * and it does not grant editing (see requireOwnedTopic) or any sight of drafts
   * belonging to somebody else.
   */
  if (user.role === "admin") {
    const leaders = await db
      .select({ id: users.id })
      .from(users)
      .where(and(isNull(users.deletedAt), inArray(users.role, ["admin", "team_lead"])));
    for (const l of leaders) ids.add(l.id);
  }

  return [...ids];
}

/**
 * The WHERE clause for "topics this user may see in the library".
 *
 * Published topics from their visible owners, plus their own drafts. Returns a clause
 * that matches nothing when there is nobody to read from — an agent with no team lead
 * assigned yet — rather than accidentally matching everything, which is what an
 * `inArray` on an empty list would risk if a caller dropped the guard.
 */
export function visibleTopicsFilter(user: User, ownerIds: string[]): SQL {
  if (ownerIds.length === 0) return sql`false`;

  const readable = and(
    inArray(learningTopics.ownerUserId, ownerIds),
    eq(learningTopics.isPublished, true),
  );

  // A leader's own drafts are visible to them and to nobody else.
  const ownDrafts = canOwnTopics(user) ? eq(learningTopics.ownerUserId, user.id) : undefined;

  return and(isNull(learningTopics.deletedAt), ownDrafts ? or(readable, ownDrafts) : readable)!;
}

/** One topic the user may READ, or a throw. */
export async function requireVisibleTopic(user: User, topicId: string): Promise<LearningTopic> {
  const ownerIds = await visibleOwnerIds(user);
  const [row] = await db
    .select()
    .from(learningTopics)
    .where(and(eq(learningTopics.id, topicId), visibleTopicsFilter(user, ownerIds)))
    .limit(1);
  if (!row) throw new TopicNotFoundError();
  return row;
}

/**
 * One topic the user may WRITE, or a throw.
 *
 * Strictly `owner_user_id = me`. Note this is stricter than reading: an admin can read
 * every leader's published library but cannot edit any of it.
 */
export async function requireOwnedTopic(user: User, topicId: string): Promise<LearningTopic> {
  if (!canOwnTopics(user)) throw new NotATopicOwnerError();
  const [row] = await db
    .select()
    .from(learningTopics)
    .where(
      and(
        eq(learningTopics.id, topicId),
        eq(learningTopics.ownerUserId, user.id),
        isNull(learningTopics.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new TopicNotFoundError();
  return row;
}

/**
 * The agents a leader is responsible for — the roster Team Progress reports on.
 *
 * Their own direct reports only. An admin does not get everybody's reports here,
 * because "who has watched my training" is a question about one leader's team.
 */
export async function myTeam(user: User): Promise<{ id: string; name: string }[]> {
  if (!canOwnTopics(user)) return [];
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.teamLeadId, user.id), isNull(users.deletedAt), eq(users.active, true)))
    .orderBy(users.name);
}
