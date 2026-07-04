"use server";
/**
 * User management server actions (admin). All mutations:
 *  - authenticate + authorize (RBAC),
 *  - validate input with Zod,
 *  - return ActionResult { success, data?, error? }.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { USER_ROLE } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { listUsersPaginated, type ListUsersParams } from "./queries";
import type { User } from "@/lib/db/schema";
import type { Paginated } from "@/types";

const setRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(USER_ROLE),
});

const setActiveSchema = z.object({
  userId: z.string().uuid(),
  active: z.boolean(),
});

/** List users — admin or manager. */
export async function listUsers(params: ListUsersParams = {}): Promise<ActionResult<Paginated<User>>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    return ok(await listUsersPaginated(params));
  } catch (err) {
    return handle(err, "listUsers");
  }
}

/** Change a user's role — admin only. Cannot demote the last admin. */
export async function setUserRole(input: z.infer<typeof setRoleSchema>): Promise<ActionResult<User>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin");
    const { userId, role } = setRoleSchema.parse(input);

    if (role !== "admin") {
      const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
      if (admins.length === 1 && admins[0]?.id === userId) {
        return fail("Cannot demote the last remaining admin.");
      }
    }

    const [updated] = await db.update(users).set({ role }).where(eq(users.id, userId)).returning();
    if (!updated) return fail("User not found.");
    revalidatePath("/users");
    return ok(updated);
  } catch (err) {
    return handle(err, "setUserRole");
  }
}

/** Activate/deactivate a user — admin only. Cannot deactivate yourself. */
export async function setUserActive(input: z.infer<typeof setActiveSchema>): Promise<ActionResult<User>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin");
    const { userId, active } = setActiveSchema.parse(input);
    if (userId === me.id && !active) return fail("You cannot deactivate your own account.");

    const [updated] = await db.update(users).set({ active }).where(eq(users.id, userId)).returning();
    if (!updated) return fail("User not found.");
    revalidatePath("/users");
    return ok(updated);
  } catch (err) {
    return handle(err, "setUserActive");
  }
}

/**
 * Remove a user — admin only. Soft delete (recoverable; keeps history).
 * Guards: must be deactivated first, cannot be yourself, cannot be the last admin.
 * Note: removes the CRM record only. To fully revoke access, also delete the person
 * in the Clerk dashboard — otherwise a future login re-creates them (inactive).
 */
export async function deleteUser(userId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin");
    z.string().uuid().parse(userId);
    if (userId === me.id) return fail("You cannot delete your own account.");

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!target) return fail("User not found.");
    if (target.active) return fail("Deactivate the user before deleting.");
    if (target.role === "admin") {
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
      if (admins.length <= 1) return fail("Cannot delete the last remaining admin.");
    }

    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));
    revalidatePath("/users");
    return ok(undefined);
  } catch (err) {
    return handle(err, "deleteUser");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You don't have permission to do that.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
