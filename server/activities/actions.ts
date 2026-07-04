"use server";
/** Activity mutations: log, complete follow-up, delete, WhatsApp+log. */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { activities, messageLog } from "@/lib/db/schema";
import { requireDbUser, canView, isManagerOrAbove, AuthorizationError } from "@/lib/auth";
import { messaging } from "@/lib/messaging";
import { ACTIVITY_TYPE, ENTITY_TYPE } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { resolveEntity, isEntityType } from "./entity";

const logSchema = z.object({
  entityType: z.enum(ENTITY_TYPE),
  entityId: z.string().uuid(),
  type: z.enum(ACTIVITY_TYPE),
  body: z.string().max(5000).optional().nullable(),
  followUpAt: z.string().datetime().optional().nullable(), // ISO string from client
});

export async function logActivity(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const d = logSchema.parse(input);

    const entity = await resolveEntity(d.entityType, d.entityId);
    if (!entity) return fail("Related record not found.");
    if (!canView(me, entity.ownerId)) throw new AuthorizationError();

    const [row] = await db
      .insert(activities)
      .values({
        entityType: d.entityType,
        entityId: d.entityId,
        type: d.type,
        body: d.body ?? null,
        occurredAt: new Date(),
        followUpAt: d.followUpAt ? new Date(d.followUpAt) : null,
        createdBy: me.id,
      })
      .returning({ id: activities.id });

    revalidatePath(entity.href);
    revalidatePath("/reminders");
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "logActivity");
  }
}

export async function completeFollowUp(activityId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(activityId);
    const [a] = await db.select().from(activities).where(eq(activities.id, activityId));
    if (!a) return fail("Activity not found.");
    if (!isManagerOrAbove(me) && a.createdBy !== me.id) throw new AuthorizationError();

    await db.update(activities).set({ followUpDoneAt: new Date() }).where(eq(activities.id, activityId));
    if (isEntityType(a.entityType)) {
      const e = await resolveEntity(a.entityType, a.entityId);
      if (e) revalidatePath(e.href);
    }
    revalidatePath("/reminders");
    return ok(undefined);
  } catch (err) {
    return handle(err, "completeFollowUp");
  }
}

export async function deleteActivity(activityId: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    z.string().uuid().parse(activityId);
    const [a] = await db.select().from(activities).where(eq(activities.id, activityId));
    if (!a) return fail("Activity not found.");
    if (me.role !== "admin" && a.createdBy !== me.id) throw new AuthorizationError();
    await db.update(activities).set({ deletedAt: new Date() }).where(eq(activities.id, activityId));
    if (isEntityType(a.entityType)) {
      const e = await resolveEntity(a.entityType, a.entityId);
      if (e) revalidatePath(e.href);
    }
    return ok(undefined);
  } catch (err) {
    return handle(err, "deleteActivity");
  }
}

const waSchema = z.object({
  entityType: z.enum(ENTITY_TYPE),
  entityId: z.string().uuid(),
  toPhone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  message: z.string().min(1).max(2000),
});

/** Generate a WhatsApp click-to-chat link (Phase A) AND log it as an activity + message_log. */
export async function sendWhatsAppAndLog(input: unknown): Promise<ActionResult<{ url: string }>> {
  try {
    const me = await requireDbUser();
    const d = waSchema.parse(input);
    const entity = await resolveEntity(d.entityType, d.entityId);
    if (!entity) return fail("Related record not found.");
    if (!canView(me, entity.ownerId)) throw new AuthorizationError();

    const result = await messaging.sendFollowUp(d.toPhone, { message: d.message });

    await db.insert(activities).values({
      entityType: d.entityType,
      entityId: d.entityId,
      type: "whatsapp",
      body: d.message,
      occurredAt: new Date(),
      createdBy: me.id,
    });
    await db.insert(messageLog).values({
      channel: "whatsapp",
      entityType: d.entityType,
      entityId: d.entityId,
      toAddress: d.toPhone,
      body: d.message,
      status: result.status === "link" ? "queued" : "sent",
      sentBy: me.id,
    });

    revalidatePath(entity.href);
    return ok({ url: result.ref });
  } catch (err) {
    return handle(err, "sendWhatsAppAndLog");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail(err.message || "You don't have permission to do that.");
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
