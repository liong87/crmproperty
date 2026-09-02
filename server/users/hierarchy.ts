/**
 * Who reports to whom.
 *
 * ONE level, deliberately. The competitor sells a five-level downline tree, which is
 * the right shape for an agency whose business is recruiting recruiters. This agency is
 * one office: a Team Lead has members, and that is the whole structure. A recursive
 * walk would let somebody build a chain by accident and quietly widen what a lead can
 * see, which is the expensive kind of bug.
 */
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

/**
 * The ids a Team Lead may see, INCLUDING their own.
 *
 * An admin gets an empty array meaning "no restriction" — callers pass this straight
 * into ownershipFilter, which already reads an empty list that way. A Team Lead with no
 * members gets just themselves, which correctly scopes them to their own work rather
 * than silently to everybody's.
 */
export async function visibleUserIds(me: User): Promise<string[]> {
  if (me.role === "admin") return [];
  if (me.role !== "team_lead") return [me.id];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.teamLeadId, me.id), isNull(users.deletedAt)));
  return [me.id, ...rows.map((r) => r.id)];
}

/** The people under a Team Lead, for their team screen. */
export async function listTeamMembers(leadId: string): Promise<TeamMember[]> {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(and(eq(users.teamLeadId, leadId), isNull(users.deletedAt)))
    .orderBy(asc(users.name));
}

/** Candidates for the "reports to" picker: active team leads and admins, not self. */
export async function listPossibleLeads(excludeUserId?: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(
      and(
        eq(users.active, true),
        isNull(users.deletedAt),
        excludeUserId ? ne(users.id, excludeUserId) : undefined,
      ),
    )
    .orderBy(asc(users.name));
  return rows.filter((r) => r.role === "team_lead" || r.role === "admin");
}
