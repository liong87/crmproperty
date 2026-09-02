"use server";
/**
 * Appointment scheduling, closer assignment and outcomes.
 *
 * Permissions follow the CLIENT, not the subject: an appointment belongs to the agent
 * working that buyer. An agent can book at a colleague's listing or at any project —
 * inventory is shared stock — but only for their own client.
 *
 * `assignedTo` is the setter (the agent who owns the client). `closerId` is who runs
 * the presentation. Under a setter/closer split those are frequently different people,
 * and both are recorded at the time because commission splits on them later.
 */
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { appointments, contacts, leads, activities, users } from "@/lib/db/schema";
import { requireDbUser, canEdit, canEditAny, isTeamLeadOrAbove, AuthorizationError } from "@/lib/auth";
import { APPOINTMENT_STATUS, APPOINTMENT_OUTCOME } from "@/lib/constants";
import { ok, fail } from "@/lib/action-result";
import { notify } from "@/lib/notify";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";

const scheduleSchema = z
  .object({
    propertyId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    leadId: z.string().uuid().optional().nullable(),
    closerId: z.string().uuid().optional().nullable(),
    // ISO string; the client converts from Malaysia local time before sending.
    scheduledAt: z.string().datetime(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => Boolean(d.contactId) !== Boolean(d.leadId), {
    message: "An appointment must be for exactly one client.",
  })
  .refine((d) => Boolean(d.propertyId) !== Boolean(d.projectId), {
    message: "An appointment must be for exactly one listing or project.",
  });

/**
 * Who owns this client, and may the current user act for them?
 *
 * Returns the owning agent's id so the appointment is assigned to whoever works the
 * client, not whoever happened to book it — a manager scheduling on an agent's behalf
 * should put it in the agent's diary, not their own.
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

/** A closer must be a real, active member of staff — not any UUID a form supplies. */
async function assertValidCloser(closerId: string | null | undefined): Promise<string | null> {
  if (!closerId) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, closerId), eq(users.active, true), isNull(users.deletedAt)));
  if (!row) throw new Error("CLOSER_NOT_FOUND");
  return row.id;
}

export async function scheduleAppointment(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const me = await requireDbUser();
    const d = scheduleSchema.parse(input);
    const owner = await resolveClientOwner(me, d);
    const closerId = await assertValidCloser(d.closerId);

    const [row] = await db
      .insert(appointments)
      .values({
        propertyId: d.propertyId ?? null,
        projectId: d.projectId ?? null,
        contactId: d.contactId ?? null,
        leadId: d.leadId ?? null,
        assignedTo: owner ?? me.id,
        closerId,
        scheduledAt: new Date(d.scheduledAt),
        status: "scheduled",
        notes: d.notes ?? null,
      })
      .returning({ id: appointments.id });

    /*
     * Booking a lead into a project's gallery IS the moment that lead becomes a lead
     * for that project — so record it, or the funnel shows an appointment under the
     * project with no lead above it and the two rows contradict each other.
     *
     * Only filled in when blank. A lead already pointed at another project is somebody
     * shopping two launches, and their stated primary interest is not ours to rewrite
     * on the back of one viewing.
     */
    let projectBackfilled = false;
    if (d.projectId && d.leadId) {
      const touched = await db
        .update(leads)
        .set({ projectId: d.projectId })
        .where(and(eq(leads.id, d.leadId), isNull(leads.projectId), isNull(leads.deletedAt)))
        .returning({ id: leads.id });
      projectBackfilled = touched.length > 0;
    }

    // Logged on the client's timeline, and doubling as the agent's reminder.
    //
    // followUpAt makes it appear on /reminders and the dashboard, so an agent has one
    // to-do list rather than having to remember to check a separate diary.
    //
    // createdBy is the SETTER, not whoever booked it: listFollowUps() scopes by
    // created_by, so a manager scheduling on an agent's behalf would otherwise put the
    // reminder in the manager's list and the agent would never see it. Who booked it
    // is recorded in the text instead.
    const attendee = owner ?? me.id;
    const bookedByOther = attendee !== me.id ? ` (booked by ${me.name})` : "";
    await db.insert(activities).values({
      entityType: d.contactId ? "contacts" : "leads",
      entityId: (d.contactId ?? d.leadId)!,
      type: "appointment",
      body:
        `Appointment scheduled${bookedByOther}.` +
        (projectBackfilled ? " Lead linked to the project." : "") +
        (d.notes ? ` ${d.notes}` : ""),
      occurredAt: new Date(),
      followUpAt: new Date(d.scheduledAt),
      createdBy: attendee,
    });

    /*
     * Tell the closer, when the closer is somebody else. No dedupe key: this is a
     * one-off human action, and being handed the same appointment twice genuinely is
     * two events worth hearing about.
     *
     * The setter is not told — they just did it.
     */
    if (closerId && closerId !== attendee) {
      await notify({
        userId: closerId,
        kind: "appointment-reminder",
        title: "An appointment has been assigned to you",
        body: `${me.name} booked it for you${d.notes ? `. ${d.notes}` : "."}`,
        link: "/appointments",
        entityType: "appointments",
        entityId: row!.id,
      });
    }

    revalidateAll(d.contactId, d.leadId, d.propertyId, d.projectId);
    return ok({ id: row!.id });
  } catch (err) {
    return handle(err, "scheduleAppointment");
  }
}

const outcomeSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(APPOINTMENT_STATUS),
  outcome: z.enum(APPOINTMENT_OUTCOME).optional().nullable(),
  remark: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

/** Record what happened. This is the half of the feature that produces the value. */
export async function recordAppointmentOutcome(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = outcomeSchema.parse(input);

    const existing = await loadEditable(me, d.id);
    if ("error" in existing) return existing.error;
    const row = existing.row;

    await db
      .update(appointments)
      .set({
        status: d.status,
        // Only somebody who turned up has an outcome; clear any stale one otherwise.
        outcome: d.status === "showed-up" ? (d.outcome ?? null) : null,
        remark: d.remark !== undefined ? d.remark : row.remark,
        notes: d.notes ?? row.notes,
      })
      .where(eq(appointments.id, d.id));

    if (d.status === "showed-up") {
      await db.insert(activities).values({
        entityType: row.contactId ? "contacts" : "leads",
        entityId: (row.contactId ?? row.leadId)!,
        type: "appointment",
        body: `Appointment — showed up${d.outcome ? ` — ${d.outcome}` : ""}${d.notes ? `. ${d.notes}` : "."}`,
        occurredAt: new Date(),
        createdBy: me.id,
      });
    } else if (d.status === "no-show") {
      // Worth its own line on the timeline: a no-show is the single most actionable
      // signal in project sales, and it is what the board's no-show rate counts.
      await db.insert(activities).values({
        entityType: row.contactId ? "contacts" : "leads",
        entityId: (row.contactId ?? row.leadId)!,
        type: "appointment",
        body: `Appointment — no show.${d.remark ? ` ${d.remark}` : ""}`,
        occurredAt: new Date(),
        createdBy: me.id,
      });
    }

    // Whatever the outcome — showed up, no-show or cancelled — the appointment is
    // dealt with, so it should leave the agent's reminder list.
    await closeAppointmentReminder(row);

    revalidateAll(row.contactId, row.leadId, row.propertyId, row.projectId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "recordAppointmentOutcome");
  }
}

const closerSchema = z.object({
  id: z.string().uuid(),
  closerId: z.string().uuid().optional().nullable(),
});

/**
 * Hand the presentation to a closer, or take it back.
 *
 * The change is written to the client's timeline rather than only to the row, so that
 * "who was handed what, and when" survives — which is what a commission dispute turns
 * on, and what a pass-out/pass-in report will later be built from.
 */
export async function assignCloser(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = closerSchema.parse(input);

    const existing = await loadEditable(me, d.id);
    if ("error" in existing) return existing.error;
    const row = existing.row;

    const closerId = await assertValidCloser(d.closerId);
    if (closerId === row.closerId) return ok(undefined);

    const [named] = closerId
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, closerId))
      : [];

    await db.update(appointments).set({ closerId }).where(eq(appointments.id, d.id));

    await db.insert(activities).values({
      entityType: row.contactId ? "contacts" : "leads",
      entityId: (row.contactId ?? row.leadId)!,
      type: "appointment",
      body: closerId
        ? `Closer assigned: ${named?.name ?? "another agent"} (by ${me.name}).`
        : `Closer removed (by ${me.name}); the setter is closing this.`,
      occurredAt: new Date(),
      createdBy: row.assignedTo ?? me.id,
    });

    // Handed to somebody: tell them. Taken back: nothing to say, they lost work they
    // had not started.
    if (closerId && closerId !== me.id) {
      await notify({
        userId: closerId,
        kind: "appointment-reminder",
        title: "An appointment has been assigned to you",
        body: `${me.name} has asked you to close this one.`,
        link: "/appointments",
        entityType: "appointments",
        entityId: d.id,
      });
    }

    revalidateAll(row.contactId, row.leadId, row.propertyId, row.projectId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "assignCloser");
  }
}

const rescheduleSchema = z.object({
  id: z.string().uuid(),
  scheduledAt: z.string().datetime(),
});

export async function rescheduleAppointment(input: unknown): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    const d = rescheduleSchema.parse(input);

    const existing = await loadEditable(me, d.id);
    if ("error" in existing) return existing.error;
    const row = existing.row;

    await db
      .update(appointments)
      // Back to scheduled: a rescheduled appointment has not happened yet, whatever it
      // was marked before.
      .set({ scheduledAt: new Date(d.scheduledAt), status: "scheduled", outcome: null })
      .where(eq(appointments.id, d.id));

    // The old reminder points at a time that no longer applies; replace it.
    await closeAppointmentReminder(row);
    await db.insert(activities).values({
      entityType: row.contactId ? "contacts" : "leads",
      entityId: (row.contactId ?? row.leadId)!,
      type: "appointment",
      body: "Appointment rescheduled.",
      occurredAt: new Date(),
      followUpAt: new Date(d.scheduledAt),
      createdBy: row.assignedTo ?? me.id,
    });

    revalidateAll(row.contactId, row.leadId, row.propertyId, row.projectId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "rescheduleAppointment");
  }
}

/**
 * Remove an appointment entirely.
 *
 * Cancelling is usually the right action — it keeps the history of an appointment that
 * was made and called off, which matters when a client claims they were never shown
 * anything. Deletion is for mistakes, so it is restricted to team leads.
 */
export async function deleteAppointment(id: string): Promise<ActionResult<void>> {
  try {
    const me = await requireDbUser();
    if (!isTeamLeadOrAbove(me)) throw new AuthorizationError();
    z.string().uuid().parse(id);

    const [row] = await db.select().from(appointments).where(eq(appointments.id, id));
    if (!row) return fail("Appointment not found.");

    await db.update(appointments).set({ deletedAt: new Date() }).where(eq(appointments.id, id));
    await closeAppointmentReminder(row);
    revalidateAll(row.contactId, row.leadId, row.propertyId, row.projectId);
    return ok(undefined);
  } catch (err) {
    return handle(err, "deleteAppointment");
  }
}

/** Load an appointment the current user is allowed to change, or the failure to return. */
async function loadEditable(
  me: Awaited<ReturnType<typeof requireDbUser>>,
  id: string,
): Promise<{ row: typeof appointments.$inferSelect } | { error: ActionResult<never> }> {
  const [row] = await db
    .select()
    .from(appointments)
    .where(and(eq(appointments.id, id), isNull(appointments.deletedAt)));
  if (!row) return { error: fail("Appointment not found.") };
  // Setter or closer, the same pair the list query scopes on. Editable and visible must
  // agree: anything a person can change, they must also be able to see.
  if (!canEditAny(me, [row.assignedTo, row.closerId])) throw new AuthorizationError();
  return { row };
}

/**
 * Close the reminder created when the appointment was scheduled.
 *
 * Without this, an appointment that has been written up or cancelled still sits in the
 * agent's Reminders as outstanding — and a to-do list containing things already done is
 * one agents stop trusting, which costs more than the reminder was worth.
 *
 * Matched on entity + type + the exact scheduled time, which is precise enough to avoid
 * closing an unrelated follow-up the agent set by hand. Both activity types are matched
 * because rows written before migration 0006 carry the old "viewing" type.
 */
async function closeAppointmentReminder(v: {
  contactId: string | null;
  leadId: string | null;
  scheduledAt: Date;
}) {
  await db
    .update(activities)
    .set({ followUpDoneAt: new Date() })
    .where(
      and(
        eq(activities.entityType, v.contactId ? "contacts" : "leads"),
        eq(activities.entityId, (v.contactId ?? v.leadId)!),
        // Rows written before migration 0006 carry the old "viewing" type.
        inArray(activities.type, ["appointment", "viewing"]),
        eq(activities.followUpAt, v.scheduledAt),
        isNull(activities.followUpDoneAt),
        isNull(activities.deletedAt),
      ),
    );
}

function revalidateAll(
  contactId: string | null | undefined,
  leadId: string | null | undefined,
  propertyId: string | null | undefined,
  projectId: string | null | undefined,
) {
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  if (propertyId) revalidatePath(`/properties/${propertyId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (leadId) revalidatePath(`/leads/${leadId}`);
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) {
    return fail("You can only schedule appointments for your own clients.");
  }
  if (err instanceof z.ZodError) return fail(err.issues.map((i) => i.message).join("; "));
  if (err instanceof Error && err.message === "CLIENT_NOT_FOUND") return fail("Client not found.");
  if (err instanceof Error && err.message === "CLOSER_NOT_FOUND") {
    return fail("That closer is not an active member of staff.");
  }
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  if (err instanceof Error && err.message === "INACTIVE_USER") {
    return fail("Your account is awaiting approval.");
  }
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}


/**
 * The board's five columns, and what each one MEANS in terms of status and outcome.
 *
 * Kept here rather than in the component so the mapping is enforced server-side: a
 * dragged card must not be able to produce a combination the outcome form could never
 * produce, such as a "booked" appointment nobody attended.
 */
const COLUMN_STATE = {
  scheduled: { status: "scheduled", outcome: null },
  "showed-up": { status: "showed-up", outcome: null },
  booked: { status: "showed-up", outcome: "booked" },
  "no-show": { status: "no-show", outcome: null },
  cancelled: { status: "cancelled", outcome: null },
} as const;

export type BoardColumnKey = keyof typeof COLUMN_STATE;

const moveSchema = z.object({
  id: z.string().uuid(),
  column: z.enum(["scheduled", "showed-up", "booked", "no-show", "cancelled"]),
});

/**
 * Move an appointment between board columns.
 *
 * A thin wrapper over recordAppointmentOutcome rather than its own update, deliberately:
 * dragging a card to "No show" must write the same timeline entry, close the same
 * reminder and pass the same permission check as recording it on the form. A second
 * write path would drift from the first, and the half that drifts is always the one
 * nobody reads.
 */
export async function moveAppointmentToColumn(input: unknown): Promise<ActionResult<void>> {
  try {
    const d = moveSchema.parse(input);
    const target = COLUMN_STATE[d.column];
    return await recordAppointmentOutcome({
      id: d.id,
      status: target.status,
      outcome: target.outcome,
    });
  } catch (err) {
    return handle(err, "moveAppointmentToColumn");
  }
}
