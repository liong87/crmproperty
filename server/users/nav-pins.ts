"use server";
/**
 * Pinning a sidebar row to the top, per user.
 *
 * A display preference and nothing more — pinning never grants access to
 * anything. Two things keep that true, and both matter:
 *
 *   1. The href is checked against lib/nav-links.ts before it is stored, so an
 *      arbitrary string from the browser never ends up rendered as a link.
 *   2. The stored hrefs are resolved back against the ROLE-FILTERED nav when the
 *      sidebar is built (app/(dashboard)/layout.tsx), so a stale pin for a page
 *      the user no longer has simply renders nothing.
 *
 * Neither check is sufficient alone: (1) without (2) would let a demoted Team
 * Lead keep a working shortcut to Users, and (2) without (1) would store
 * whatever it was handed and rely on the reader to be careful forever.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { requireDbUser } from "@/lib/auth";
import { ok, fail } from "@/lib/action-result";
import { monitoring } from "@/lib/monitoring";
import type { ActionResult } from "@/types";
import { isPinnableHref, MAX_PINS } from "@/lib/nav-links";

/**
 * Pin an unpinned row, or unpin a pinned one.
 *
 * A toggle rather than separate pin/unpin actions because the button is a
 * toggle: two actions would mean the client deciding which one to call from
 * state it may have refreshed away from.
 */
export async function toggleNavPin(href: string): Promise<ActionResult<{ pinned: boolean }>> {
  try {
    const parsed = z.string().min(1).max(200).parse(href);
    if (!isPinnableHref(parsed)) return fail("That page cannot be pinned.");

    const me = await requireDbUser();
    const current = (me.pinnedNav ?? []).filter(isPinnableHref);
    const isPinned = current.includes(parsed);

    // Append rather than prepend: the order is the order they pinned things in,
    // which stays stable as they add more. Prepending reshuffles the list every
    // time and the row you were aiming for has moved by the time you click.
    const next = isPinned ? current.filter((h) => h !== parsed) : [...current, parsed];

    if (next.length > MAX_PINS) {
      return fail(`You can pin up to ${MAX_PINS} pages. Unpin one first.`);
    }

    await db.update(users).set({ pinnedNav: next }).where(eq(users.id, me.id));

    // No revalidatePath: the sidebar lives in the dashboard layout, and the
    // client calls router.refresh() on success, which re-renders it. Calling
    // revalidatePath("/", "layout") here would drop every cached page in the
    // app to move one row six pixels.
    return ok({ pinned: !isPinned });
  } catch (err) {
    if (err instanceof z.ZodError) return fail("That page cannot be pinned.");
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    monitoring.captureException(err, { where: "toggleNavPin" });
    return fail("Could not change your pinned pages.");
  }
}
