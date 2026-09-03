/**
 * Edit permission, resolved against the REAL hierarchy.
 *
 * `lib/auth/rbac.ts` holds the pure rule and takes the set of people whose records the
 * user may write. This module is the one place that resolves that set, from
 * `users.team_lead_id` — the same source `visibleUserIds` uses for read scope. Keeping
 * them on one source is the whole point: edit scope must never again be wider than view
 * scope, which is how a team lead came to be able to write to every record in the agency.
 *
 * No "use server" directive: these are helpers for server code, not endpoints. See
 * server/leads/remarks-internal.ts for why that distinction matters here.
 */
import type { User } from "@/lib/db/schema";
import { assertCanEdit, assertCanEditAny, canEdit } from "@/lib/auth";
import { visibleUserIds } from "@/server/users/hierarchy";

/**
 * Whose records may this person write?
 *
 * Admin gets an empty array and never consults it — `canEdit` short-circuits on the
 * role. An agent gets their own id. A team lead gets themselves plus their downline.
 */
async function editableIds(me: User): Promise<string[]> {
  if (me.role === "admin") return [];
  if (me.role !== "team_lead") return [me.id];
  return visibleUserIds(me);
}

/** Assert this user may edit a record owned by `ownerId`, or throw AuthorizationError. */
export async function assertCanEditOwned(me: User, ownerId: string | null): Promise<void> {
  assertCanEdit(me, ownerId, await editableIds(me));
}

/**
 * Assert across several owner columns — a record is editable if the user owns it in ANY
 * of the given roles. Appointments need this: `assignedTo` is the setter and `closerId`
 * is whoever runs the presentation, and they are routinely different people.
 */
export async function assertCanEditOwnedAny(
  me: User,
  ownerIds: Array<string | null>,
): Promise<void> {
  assertCanEditAny(me, ownerIds, await editableIds(me));
}

/** Non-throwing form, for callers that branch rather than fail. */
export async function canEditOwned(me: User, ownerId: string | null): Promise<boolean> {
  return canEdit(me, ownerId, await editableIds(me));
}
