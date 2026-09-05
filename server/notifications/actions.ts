"use server";
/**
 * Marking notifications read.
 *
 * Every write is scoped to the CALLER's own rows — the user id comes from the session,
 * never from the request — so an id belonging to somebody else simply matches nothing.
 */
import { z } from "zod";
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { notifications } from "@/lib/db/schema";
import { requireDbUser, AuthorizationError } from "@/lib/auth";
import { ok, fail, failFromZod } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("You do not have permission to do that.");
  if (err instanceof z.ZodError) return failFromZod(err);
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

/**
 * Dismiss one notification.
 *
 * A soft delete, like everything else in this codebase — `listNotifications` already
 * filters `deleted_at IS NULL`, so the column and the read path existed; nothing ever
 * wrote to it. Read notifications therefore stayed on the list forever and the Inbox
 * only ever grew, which is the opposite of what an inbox is for.
 *
 * Not a hard delete: a notification is the only durable record that a lead was passed
 * on or paperwork fell due, and an agent tidying their list should not destroy that.
 */
export async function dismissNotification(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(id);
    await db
      .update(notifications)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(notifications.id, id),
        // Scoped to the caller's own rows: an id belonging to somebody else matches
        // nothing rather than erroring, so this leaks no information either way.
        eq(notifications.userId, me.id),
        isNull(notifications.deletedAt),
      ));
    revalidatePath("/inbox");
    return ok<void>(undefined);
  } catch (err) {
    return handle(err, "dismissNotification");
  }
}

/**
 * Clear everything already read.
 *
 * Deliberately scoped to READ rows. "Clear all" would let one click hide a lead that
 * was passed to you an hour ago and never seen — the unread ones are the whole point
 * of the page.
 */
export async function clearReadNotifications(): Promise<ActionResult<number>> {
  try {
    const me = await requireDbUser();
    const cleared = await db
      .update(notifications)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(notifications.userId, me.id),
        isNotNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ))
      .returning({ id: notifications.id });
    revalidatePath("/inbox");
    return ok(cleared.length);
  } catch (err) {
    return handle(err, "clearReadNotifications");
  }
}
