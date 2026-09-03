/**
 * Role-based access control. Enforce in server actions AND DB queries — never UI only.
 *
 *  admin   → full access to all data
 *  team_lead → view all; edit their team's data
 *  agent   → view/edit only own assigned records
 */
import { type SQL, eq, or, inArray } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { User } from "@/lib/db/schema";
import type { Role } from "./interface";

export class AuthorizationError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Assert the user has one of the allowed roles, else throw. */
export function assertRole(user: User, ...allowed: Role[]): void {
  if (!allowed.includes(user.role as Role)) {
    throw new AuthorizationError(`Requires role: ${allowed.join(" or ")}`);
  }
}

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}
export function isTeamLeadOrAbove(user: User): boolean {
  return user.role === "admin" || user.role === "team_lead";
}

/** Can this user VIEW a record owned by ownerId (in teamId)? */
export function canView(user: User, ownerId: string | null, teamId?: string | null): boolean {
  if (isTeamLeadOrAbove(user)) return true; // admin + team lead view all
  return ownerId === user.id; // agent: own only
  void teamId;
}

/**
 * Can this user EDIT a record owned by ownerId?
 *
 * `editableIds` is the set of people whose records this user may write — for a team
 * lead, themselves plus their downline, as `visibleUserIds` resolves it. It is REQUIRED,
 * and that is the point.
 *
 * It used to be an optional `teamId` compared against `users.teamId`, and the branch
 * read `teamId == null || teamId === user.teamId`. Every one of the twenty-odd call
 * sites omitted the argument, and nothing in the codebase ever writes `users.teamId` —
 * so the comparison was `undefined == null`, which is true, and every team lead could
 * write to every record in the agency. Read scope was correctly narrowed by
 * `ownershipFilter` and the hierarchy in `users.team_lead_id`; write scope was not
 * narrowed at all, which is the wrong way round.
 *
 * Making the parameter required is deliberate: the compiler now refuses to let a caller
 * forget it, which is the only reason the old version stayed broken so long.
 *
 * Use `assertCanEditOwned` in server/auth/ownership.ts rather than calling this
 * directly — it resolves the set for you from the real hierarchy.
 */
export function canEdit(user: User, ownerId: string | null, editableIds: string[]): boolean {
  if (user.role === "admin") return true;
  if (ownerId != null && ownerId === user.id) return true; // always your own
  if (user.role === "team_lead") return ownerId != null && editableIds.includes(ownerId);
  return false; // agent: own only, and that was handled above
}

/** Assert edit permission or throw. */
export function assertCanEdit(user: User, ownerId: string | null, editableIds: string[]): void {
  if (!canEdit(user, ownerId, editableIds)) throw new AuthorizationError();
}

/**
 * Ownership filter for LIST queries. Returns a Drizzle SQL condition (or undefined
 * = no restriction) to AND into a where clause, scoped by the user's role.
 *
 * @param ownerColumn the assigned-to column on the table (e.g. leads.assignedTo)
 * @param teamMemberIds ids of the team lead's members (optional; team leads see all by default)
 */
/**
 * Ownership filter across SEVERAL owner columns — a record is visible if the user
 * owns it in ANY of the given roles.
 *
 * Appointments are why this exists. Since the setter/closer split, `assignedTo` is the
 * setter and `closerId` is whoever runs the presentation, and those are routinely
 * different people. Filtering on the setter alone meant a closer could edit an
 * appointment they were unable to see — handed a presentation that was invisible in
 * their own diary.
 *
 * Getting this wrong fails in one of two bad ways: too narrow hides an agent's own
 * work from them, too wide leaks the whole team's pipeline. Hence the tests.
 */
export function ownershipFilterAny(
  user: User,
  ownerColumns: AnyPgColumn[],
  teamMemberIds?: string[],
): SQL | undefined {
  if (ownerColumns.length === 0) return undefined;
  if (isTeamLeadOrAbove(user)) {
    if (user.role === "team_lead" && teamMemberIds && teamMemberIds.length > 0) {
      return or(
        ...ownerColumns.flatMap((c) => [inArray(c, teamMemberIds), eq(c, user.id)]),
      );
    }
    return undefined;
  }
  // Agent: theirs in any role. NULL columns simply do not match, which is correct —
  // an appointment with no closer is visible to its setter and nobody else.
  return or(...ownerColumns.map((c) => eq(c, user.id)));
}

/** Can this user EDIT a record they may own through any of several roles? */
export function canEditAny(
  user: User,
  ownerIds: Array<string | null>,
  editableIds: string[],
): boolean {
  return ownerIds.some((id) => canEdit(user, id, editableIds));
}

/** Assert edit permission across several owner roles, or throw. */
export function assertCanEditAny(
  user: User,
  ownerIds: Array<string | null>,
  editableIds: string[],
): void {
  if (!canEditAny(user, ownerIds, editableIds)) throw new AuthorizationError();
}

export function ownershipFilter(
  user: User,
  ownerColumn: AnyPgColumn,
  teamMemberIds?: string[],
): SQL | undefined {
  if (isTeamLeadOrAbove(user)) {
    // Team leads/admins view everything. If a team scope is provided, honour it.
    if (user.role === "team_lead" && teamMemberIds && teamMemberIds.length > 0) {
      return or(inArray(ownerColumn, teamMemberIds), eq(ownerColumn, user.id));
    }
    return undefined;
  }
  return eq(ownerColumn, user.id); // agent: own only
}
