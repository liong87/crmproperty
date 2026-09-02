"use server";
/**
 * Writing whether this browser shows the sidebar full-width or collapsed.
 *
 * A COOKIE rather than a users column, deliberately. The sidebar renders in the
 * dashboard shell, so its width is decided before anything else paints — and a
 * preference read on the client (localStorage) means the server renders 240px,
 * the browser then corrects it to 64px, and every page load starts with the
 * layout visibly jumping. A cookie arrives with the request, so the first paint
 * is already right.
 *
 * It is per-browser, not per-account, and that is the correct scope: somebody
 * who collapses the nav on a 13" laptop has said nothing about what they want
 * on the 27" monitor at the office.
 *
 * Only the setter lives here — a "use server" module may export nothing but
 * async functions, and the reader is in lib/sidebar-pref.ts.
 */
import { cookies } from "next/headers";
import { ok } from "@/lib/action-result";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-pref";
import type { ActionResult } from "@/types";

export async function setSidebarCollapsed(
  collapsed: boolean,
): Promise<ActionResult<{ collapsed: boolean }>> {
  const jar = await cookies();
  jar.set(SIDEBAR_COOKIE, collapsed ? "1" : "0", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    // Not sensitive in either direction — it is a width — but there is no reason
    // for client JS to read it, and none for it to travel anywhere but here.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  return ok({ collapsed });
}
