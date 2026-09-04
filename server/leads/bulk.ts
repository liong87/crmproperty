"use server";
/**
 * Bulk actions on selected leads.
 *
 * Every one of these writes a system remark per lead. A bulk action is the easiest
 * place for work to happen invisibly — twenty leads change owner in one click and
 * nothing on any of them says why — and the remark thread is where an agent looks to
 * understand what happened to a lead they were handed.
 */
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { leads, users, projects } from "@/lib/db/schema";
import { requireDbUser, assertRole, AuthorizationError } from "@/lib/auth";
import { ok, fail, failFromZod } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { addSystemRemark } from "./remarks-internal";

const idsSchema = z.array(z.string().uuid()).min(1).max(200);

const live = (ids: string[]) => and(inArray(leads.id, ids), isNull(leads.deletedAt));

/** Hand several leads to one person. */
export async function bulkAssign(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const d = z.object({ ids: idsSchema, userId: z.string().uuid() }).parse(input);

    const [to] = await db
      .select({ name: users.name, active: users.active })
      .from(users)
      .where(and(eq(users.id, d.userId), isNull(users.deletedAt)));
    if (!to) return fail("That person was not found.");
    if (!to.active) return fail("That person is not active — assigning would file the leads where nobody is looking.");

    const moved = await db
      .update(leads)
      .set({
        assignedTo: d.userId,
        assignedAt: new Date(),
        recycleCount: sql`${leads.recycleCount} + 1`,
      })
      .where(live(d.ids))
      .returning({ id: leads.id });

    for (const l of moved) await addSystemRemark(l.id, `Assigned to ${to.name} by ${me.name}.`);

    revalidatePath("/leads");
    revalidatePath("/working-leads");
    return ok({ moved: moved.length });
  } catch (err) {
    return handle(err, "bulkAssign");
  }
}

/** Set the product (project) on several leads at once. */
export async function bulkSetProject(input: unknown): Promise<ActionResult<{ moved: number }>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const d = z.object({ ids: idsSchema, projectId: z.string().uuid().nullable() }).parse(input);

    let label = "no project";
    if (d.projectId) {
      const [p] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(and(eq(projects.id, d.projectId), isNull(projects.deletedAt)));
      if (!p) return fail("That project was not found.");
      label = p.name;
    }

    const moved = await db
      .update(leads)
      .set({ projectId: d.projectId })
      .where(live(d.ids))
      .returning({ id: leads.id });

    for (const l of moved) await addSystemRemark(l.id, `Product set to ${label} by ${me.name}.`);

    revalidatePath("/leads");
    revalidatePath("/working-leads");
    return ok({ moved: moved.length });
  } catch (err) {
    return handle(err, "bulkSetProject");
  }
}

/**
 * Pull leads back from whoever holds them.
 *
 * The gap this fills: a lead assigned to the wrong agent had no clean way back —
 * reassigning it to somebody else was the only move, which is not the same thing as
 * saying "nobody owns this yet". Unassigned is a real and useful state.
 *
 * Counted as a recycle, because being taken off somebody IS the lead going round
 * again, and the recycle column exists precisely to show leads being passed about.
 */
export async function revokeLeads(input: unknown): Promise<ActionResult<{ revoked: number }>> {
  try {
    const me = await requireDbUser();
    assertRole(me, "admin", "team_lead");
    const d = z.object({ ids: idsSchema }).parse(input);

    const before = await db
      .select({ id: leads.id, holder: users.name })
      .from(leads)
      .leftJoin(users, eq(users.id, leads.assignedTo))
      .where(live(d.ids));

    const revoked = await db
      .update(leads)
      .set({
        assignedTo: null,
        assignedAt: null,
        recycleCount: sql`${leads.recycleCount} + 1`,
      })
      .where(live(d.ids))
      .returning({ id: leads.id });

    const held = new Map(before.map((b) => [b.id, b.holder]));
    for (const l of revoked) {
      const from = held.get(l.id);
      await addSystemRemark(
        l.id,
        from ? `Taken back from ${from} by ${me.name}.` : `Returned to unassigned by ${me.name}.`,
      );
    }

    revalidatePath("/leads");
    revalidatePath("/working-leads");
    return ok({ revoked: revoked.length });
  } catch (err) {
    return handle(err, "revokeLeads");
  }
}

function handle(err: unknown, where: string): ActionResult<never> {
  if (err instanceof AuthorizationError) return fail("Only a team lead or admin can do that.");
  // failFromZod, not a joined list of messages: the join threw away issue.path, which
  // is the only thing that lets the form put "that is not a phone number" beside the
  // phone input instead of at the bottom of the page.
  if (err instanceof z.ZodError) return failFromZod(err);
  if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
  monitoring.captureException(err, { where });
  return fail("Something went wrong.");
}
