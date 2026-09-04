"use server";
/**
 * Search endpoint for the command palette.
 *
 * Everything exported from a `"use server"` module is a browser-callable endpoint, so
 * this one authenticates and scopes itself — `requireDbUser` throws for a signed-out
 * or inactive account, and `globalSearch` applies the same ownership filter the list
 * pages use.
 */
import { requireDbUser } from "@/lib/auth";
import { globalSearch, type SearchHit } from "./global";

export async function searchEverything(query: string): Promise<SearchHit[]> {
  const user = await requireDbUser();
  if (typeof query !== "string") return [];
  return globalSearch(user, query.slice(0, 100));
}
