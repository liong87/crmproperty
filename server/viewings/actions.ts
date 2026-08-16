"use server";
/**
 * Viewing scheduling and outcomes.
 *
 * Permissions follow the client record, not the property: a viewing belongs to the
 * agent working that buyer. An agent can schedule a viewing at a colleague's listing
 * — that is normal, listings are shared stock — but only for their own client.
 */
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { viewings, contacts, leads, activities } from "@/lib/db/schema";
import { requireDbUser, canEdit, isManagerOrAbove, AuthorizationError } from "@/lib/auth";
import { VIEWING_STATUS, VIEWING_OUTCOME } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

const scheduleSchema = z
  .object({
    propertyId: z.string().uuid(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    // ISO string; the client converts from Malaysia local time before sending.
    scheduledAt: z.string().datetime(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => Boolean(d.contactId) !== Boolean(d.leadId), {
    message: "A viewing must be for exactly one client.",
  });

/**
 * Who owns this client, and may the current user act for them?
 *
 * Returns the owning agent's id so the viewing is assigned to whoever works the
 * client, not whoever happened to book it — a manager scheduling on an agent's behalf
 * should put the appointment in the agent's diary, not their own.
 */
async function resolveClientOwner(
  me: Awaited<ReturnType<typeof requireDbUser>>,
  d: { contactId?: string | null; leadId?: string | null },
): Promise<string | null> {
  if (d.contactId) {
    const [row] = await db
      .select({ owner: contacts.assignedTo })
      .from(contacts)
      .where(and(eq(contacts.id, d.contactId), isNull(contacts.deletedAt)));
    if (!row) throw new Error("CLIENT_NOT_FOUND");
    if (!canEdit(me, row.owner)) throw new AuthorizationError();
    return row.owner;
  }
  const [row] = await db
    .select({ owner: leads.assignedTo })
    .from(leads)
    .where(and(eq(leads.id, d.leadId!), isNull(leads.deletedAt)));
  if (!row) throw new Error("CLIENT_NOT_FOUND");
  if (!canEdit(me, row.owner)) throw new AuthorizationError();
  return row.owner;
}

export async function scheduleViewing(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const d = scheduleSchema.parse(input);
    const owner = await resolveClientOwner(me, d);

    const [row] = await db
      .insert(viewings)
      .values({
        propertyId: d.propertyId,
        contactId: d.contactId ?? null,
        leadId: d.leadId ?? null,
        assignedTo: owner ?? me.id,
        scheduledAt: new Date(d.scheduledAt),
        status: "scheduled",
        notes: d.notes ?? null,
      })
      .returning({ id: viewings.id });

    // Also logged on the client's timeline, so the record of "what happened with this
    // person" stays in one place rather than being split across two features.
    await db.insert(activities).values({
      entityType: d.contactId ? "contacts" : "leads",
      entityId: (d.contactId ?? d.leadId)!,
      type: "viewing",
      body: `Viewing scheduled for ${new Date(d.scheduledAt).toISOString()}.`,
      occurredAt: new Date(),
      createdBy: me.id,
    });

    revalidateAll(d.contactId, d.leadId, d.propertyId);
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "scheduleViewing");
  }
}

const outcomeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(VIEWING_STATUS),
  outcome: z.enum(VIEWING_OUTCOME).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Record what happened. This is the half of the feature that produces the value. */
export async function recordViewingOutcome(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = outcomeSchema.parse(input);

    const [existing] = await db
      .select()
      .from(viewings)
      .where(and(eq(viewings.id, d.id), isNull(viewings.deletedAt)));
    if (!existing) return fail("Viewing not found.");
    if (!canEdit(me, existing.assignedTo)) throw new AuthorizationError();

    await db
      .update(viewings)
      .set({
        status: d.status,
        // A cancelled or no-show viewing has no outcome to record; clear any stale one.
        outcome: d.status === "completed" ? (d.outcome ?? null) : null,
        notes: d.notes ?? existing.notes,
      })
      .where(eq(viewings.id, d.id));

    if (d.status === "completed") {
      await db.insert(activities).values({
        entityType: existing.contactId ? "contacts" : "leads",
        entityId: (existing.contactId ?? existing.leadId)!,
        type: "viewing",
        body: `Viewing completed${d.outcome ? ` — ${d.outcome}` : ""}${d.notes ? `. ${d.notes}` : "."}`,
        occurredAt: new Date(),
        createdBy: me.id,
      });
    }

    revalidateAll(existing.contactId, existing.leadId, existing.propertyId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "recordViewingOutcome");
  }
}

const rescheduleSchema = z.object({
  id: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

export async function rescheduleViewing(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = rescheduleSchema.parse(input);

    const [existing] = await db
      .select()
      .from(viewings)
      .where(and(eq(viewings.id, d.id), isNull(viewings.deletedAt)));
    if (!existing) return fail("Viewing not found.");
    if (!canEdit(me, existing.assignedTo)) throw new AuthorizationError();

    await db
      .update(viewings)
      // Back to scheduled: a rescheduled viewing has not happened yet, whatever it
      // was marked before.
      .set({ scheduledAt: new Date(d.scheduledAt), status: "scheduled", outcome: null })
      .where(eq(viewings.id, d.id));

    revalidateAll(existing.contactId, existing.leadId, existing.propertyId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "rescheduleViewing");
  }
}

/**
 * Remove a viewing entirely.
 *
 * Cancelling is usually the right action — it keeps the history of an appointment
 * that was made and called off, which matters when a client claims they were never
 * shown a property. Deletion is for mistakes, so it is restricted to managers.
 */
export async function deleteViewing(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    if (!isManagerOrAbove(me)) throw new AuthorizationError();
    z.string().uuid().parse(id);

    const [existing] = await db.select().from(viewings).where(eq(viewings.id, id));
    if (!existing) return fail("Viewing not found.");

    await db.update(viewings).set({ deletedAt: new Date() }).where(eq(viewings.id, id));
    revalidateAll(existing.contactId, existing.leadId, existing.propertyId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "deleteViewing");
  }
}

function revalidateAll(contactId: string | null | undefined, leadId: string | null | undefined, propertyId: string) {
  revalidatePath("/viewings");
  revalidatePath("/dashboard");
  revalidatePath(`/properties/${propertyId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) {
    return fail("You can only schedule viewings for your own clients.");
  }
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "CLIENT_NOT_FOUND") return fail("Client not found.");
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  if (err instanceof Error && err.message === "INACTIVE_USER") {
    return fail("Your account is awaiting approval.");
  }
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
