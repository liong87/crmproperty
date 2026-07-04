/**
 * Role-based access control. Enforce in server actions AND DB queries — never UI only.
 *
 *  admin   → full access to all data
 *  manager → view all; edit team data
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
export function isManagerOrAbove(user: User): boolean {
  return user.role === "admin" || user.role === "manager";
}

/** Can this user VIEW a record owned by ownerId (in teamId)? */
export function canView(user: User, ownerId: string | null, teamId?: string | null): boolean {
  if (isManagerOrAbove(user)) return true; // admin + manager view all
  return ownerId === user.id; // agent: own only
  void teamId;
}

/** Can this user EDIT a record owned by ownerId (in teamId)? */
export function canEdit(user: User, ownerId: string | null, teamId?: string | null): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager") return teamId == null || teamId === user.teamId; // team data
  return ownerId === user.id; // agent: own only
}

/** Assert edit permission or throw. */
export function assertCanEdit(user: User, ownerId: string | null, teamId?: string | null): void {
  if (!canEdit(user, ownerId, teamId)) throw new AuthorizationError();
}

/**
 * Ownership filter for LIST queries. Returns a Drizzle SQL condition (or undefined
 * = no restriction) to AND into a where clause, scoped by the user's role.
 *
 * @param ownerColumn the assigned-to column on the table (e.g. leads.assignedTo)
 * @param teamMemberIds ids of users in the manager's team (optional; managers see all by default)
 */
export function ownershipFilter(
  user: User,
  ownerColumn: AnyPgColumn,
  teamMemberIds?: string[],
): SQL | undefined {
  if (isManagerOrAbove(user)) {
    // Managers/admins view everything. If a team scope is provided, honour it.
    if (user.role === "manager" && teamMemberIds && teamMemberIds.length > 0) {
      return or(inArray(ownerColumn, teamMemberIds), eq(ownerColumn, user.id));
    }
    return undefined;
  }
  return eq(ownerColumn, user.id); // agent: own only
}
