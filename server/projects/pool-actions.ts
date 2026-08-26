"use server";
/**
 * Managing a project's lead pool.
 *
 * Manager and admin only: pool membership decides who receives paid leads, and
 * therefore whose funnel and commission they land in.
 */
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { projectPoolMembers, users } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

export async function addPoolMember(projectId: string, userId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(projectId);
    z.string().uuid().parse(userId);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.active, true), isNull(users.deletedAt)));
    if (!user) return fail("That person is not an active member of staff.");

    const [existing] = await db
      .select({ id: projectPoolMembers.id })
      .from(projectPoolMembers)
      .where(
        and(
          eq(projectPoolMembers.projectId, projectId),
          eq(projectPoolMembers.userId, userId),
          isNull(projectPoolMembers.deletedAt),
        ),
      );
    if (existing) return fail("They are already in this pool.");

    // Appended to the end of the rotation, so adding someone never reorders the
    // people already in it.
    const orderRows = (await db.execute(sql`
      select coalesce(max(sort_order), -1) + 1 as next
      from project_pool_members
      where project_id = ${projectId} and deleted_at is null
    `)) as unknown as Array<{ next: number | string }>;

    await db.insert(projectPoolMembers).values({
      projectId,
      userId,
      // Appended to the end, so adding somebody never reorders the existing rotation.
      sortOrder: Number(orderRows[0]?.next ?? 0),
    });

    revalidatePath(`/projects/${projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "addPoolMember");
  }
}

export async function setPoolMemberActive(id: string, active: boolean): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);

    const [row] = await db
      .update(projectPoolMembers)
      .set({ active })
      .where(and(eq(projectPoolMembers.id, id), isNull(projectPoolMembers.deletedAt)))
      .returning({ projectId: projectPoolMembers.projectId });
    if (!row) return fail("Pool member not found.");

    revalidatePath(`/projects/${row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "setPoolMemberActive");
  }
}

export async function removePoolMember(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "manager");
    z.string().uuid().parse(id);

    const [row] = await db
      .update(projectPoolMembers)
      .set({ deletedAt: new Date() })
      .where(and(eq(projectPoolMembers.id, id), isNull(projectPoolMembers.deletedAt)))
      .returning({ projectId: projectPoolMembers.projectId });
    if (!row) return fail("Pool member not found.");

    revalidatePath(`/projects/${row.projectId}`);
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "removePoolMember");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to change lead pools.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
