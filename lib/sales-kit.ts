/**
 * Sales-kit vocabulary, shared by the server module and the client component.
 *
 * Lives in lib/ rather than server/ on purpose: the client component needs the
 * category list and their titles at runtime, and importing those from a module that
 * also imports the database client would drag the DB client into the browser bundle.
 * Types can cross that line (they are erased); runtime values cannot.
 */

/** Fixed set: free-text categories fragment into "Forms", "forms" and "FORM". */
export const RESOURCE_CATEGORIES = [
  "price-list",
  "legal",
  "marketing",
  "forms",
  "panel",
  "logistics",
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

/** Display order is the order an agent actually works through a kit. */
export const CATEGORY_TITLES: Record<ResourceCategory, string> = {
  "price-list": "Pricing & availability",
  legal: "Legal & licensing",
  marketing: "Marketing material",
  forms: "Blank forms",
  panel: "Panel lawyer & bankers",
  logistics: "Showroom & logistics",
};

export function isResourceCategory(v: string): v is ResourceCategory {
  return (RESOURCE_CATEGORIES as readonly string[]).includes(v);
}
