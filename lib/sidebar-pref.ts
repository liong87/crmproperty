/**
 * Reading the sidebar's collapsed state.
 *
 * Separate from the server action that WRITES it (server/preferences/sidebar.ts)
 * for a hard reason, not a stylistic one: a "use server" module may only export
 * async functions, so the cookie name cannot live there — and the reader does
 * not want to be an action anyway. The dashboard layout is a server component;
 * it calls this directly rather than paying for an RPC round trip to learn a
 * boolean it could read from the request it is already handling.
 */
import { cookies } from "next/headers";

export const SIDEBAR_COOKIE = "sidebar_collapsed";

/** Anything other than "1" means expanded — including no cookie at all. */
export async function getSidebarCollapsed(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(SIDEBAR_COOKIE)?.value === "1";
}
