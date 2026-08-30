"use server";
/**
 * Marking notifications read.
 *
 * Every write is scoped to the CALLER's own rows — the user id comes from the session,
 * never from the request — so an id belonging to somebody else simply matches nothing.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { requireDbUser, AuthorizationError } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to do that.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}

export async function markRead(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(id);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, me.id),
        isNull(notifications.readAt),
      ));
    revalidatePath("/inbox");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "markRead");
  }
}

export async function markAllRead(): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(notifications.userId, me.id),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ));
    revalidatePath("/inbox");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "markAllRead");
  }
}
