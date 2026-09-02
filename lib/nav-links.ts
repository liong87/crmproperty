/**
 * Every href the sidebar can show, and therefore every href a user may pin.
 *
 * This list exists so the pin action has something to validate against. Without
 * it, `togglePin` would take any string the browser sent and store it, and the
 * sidebar would happily render a pinned row pointing at "/etc/passwd" or at
 * somebody's phishing page — a stored-and-rendered link is not a small bug.
 *
 * Being on this list only makes an href PINNABLE, never VISIBLE: the pinned rows
 * are built by looking each href up in the groups the user's role already
 * produced (see app/(dashboard)/layout.tsx), so a pin can never resurrect a page
 * the user has since lost access to.
 */
export const PINNABLE_HREFS = [
  "/dashboard",
  "/inbox",
  "/working-leads",
  "/appointments",
  "/pipeline",
  "/leads",
  "/leads-capture",
  "/reports",
  "/properties",
  "/projects",
  "/contacts",
  "/learning",
  "/team",
  "/settings/commission",
  "/templates",
  "/users",
] as const;

export type PinnableHref = (typeof PINNABLE_HREFS)[number];

export function isPinnableHref(href: string): href is PinnableHref {
  return (PINNABLE_HREFS as readonly string[]).includes(href);
}

/**
 * How many rows may sit in "Pinned".
 *
 * A cap rather than none, because a pinned list holding every page is just the
 * sidebar again, one section higher — the shortcut stops being a shortcut.
 */
export const MAX_PINS = 6;
