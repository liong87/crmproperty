"use server";
/** Activity mutations: log, complete follow-up, delete, WhatsApp+log. */
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { activities, leads, messageLog } from "@/lib/db/schema";

/** Activity types that mean somebody actually contacted the client. */
const TOUCH_TYPES: readonly string[] = ["call", "whatsapp", "email", "appointment", "viewing"];
import { requireDbUser, canEdit, isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";
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
    // canEdit, not canView: logging an activity WRITES to someone's record and can
    // put a follow-up in their reminder list. Read permission is broader — a manager
    // can view every record but should only write to their own team's — and all
    // three detail pages already gate the logging form on canEdit, so checking
    // canView here left the server more permissive than the interface implied.
    if (!canEdit(me, entity.ownerId)) throw new AuthorizationError();

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

    /*
     * A logged call or WhatsApp IS a follow-up, so it moves the same counters the
     * remark thread moves. One column, written from both places — otherwise the
     * follow-up rate would depend on which button the agent happened to press.
     */
    if (d.entityType === "leads" && TOUCH_TYPES.includes(d.type)) {
      await db
        .update(leads)
        .set({ lastFollowUpAt: new Date(), followUpCount: sql`${leads.followUpCount} + 1` })
        .where(eq(leads.id, d.entityId));
    }

    revalidatePath(entity.href);
    revalidatePath("/inbox");
    revalidatePath("/working-leads");
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
    if (!isTeamLeadOrAbove(me) && a.createdBy !== me.id) throw new AuthorizationError();

    await db.update(activities).set({ followUpDoneAt: new Date() }).where(eq(activities.id, activityId));
    if (isEntityType(a.entityType)) {
      const e = await resolveEntity(a.entityType, a.entityId);
      if (e) revalidatePath(e.href);
    }
    revalidatePath("/inbox");
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
    // Messaging a client is an outbound action taken in the agency's name, so it
    // needs edit permission on the record, not merely the right to read it.
    if (!canEdit(me, entity.ownerId)) throw new AuthorizationError();

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
