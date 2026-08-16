/**
 * Buyer ↔ listing matching.
 *
 * Every input this needs was already being captured and never used: leads and
 * contacts carry `interest`, `budgetMin`, `budgetMax` and `preferredAreas`;
 * properties carry `listingType`, `askingPrice`, `state` and `area`. Agents were
 * doing this join from memory.
 *
 * Deliberately pure and free of database access so the rules can be unit tested and
 * argued about on their own. The queries in ./queries.ts narrow the candidate set in
 * SQL, then rank what comes back with `scoreMatch`.
 *
 * The rules are intentionally forgiving. A buyer who says "up to RM 800k" will look
 * at RM 850k, and someone asking for Mont Kiara will consider Dutamas. A matcher that
 * only ever returned perfect fits would return nothing, and agents would stop opening
 * the panel — which is a worse outcome than the occasional near-miss.
 */

/** How far outside a stated budget a listing may sit and still be shown. */
export const BUDGET_TOLERANCE = 0.1;

export interface BuyerCriteria {
  interest: string | null;
  /** Integer cents (MYR), as stored. */
  budgetMin: number | null;
  budgetMax: number | null;
  /** Free text, e.g. "Mont Kiara, Bangsar". */
  preferredAreas: string | null;
}

export interface ListingFacts {
  listingType: string; // sale | rent
  askingPrice: number; // integer cents
  state: string;
  area: string;
}

export interface MatchResult {
  /** 0–100. Only meaningful for ranking within one list. */
  score: number;
  /** Short human phrases explaining the score, for display next to each result. */
  reasons: string[];
}

/**
 * Which kind of listing does this person want?
 *
 * `invest` is treated as buying — an investor is a purchaser, whatever their motive.
 * `sell` returns null: a vendor is not shopping, and showing them listings would be
 * noise. Unknown or missing interest also returns null rather than guessing, because
 * showing a rental to a buyer is worse than showing nothing.
 */
export function listingTypeFor(interest: string | null): "sale" | "rent" | null {
  switch ((interest ?? "").trim().toLowerCase()) {
    case "buy":
    case "invest":
      return "sale";
    case "rent":
      return "rent";
    default:
      return null;
  }
}

/**
 * The price range to search, with tolerance applied.
 *
 * A null bound means "no limit that side" — someone who gave only a maximum still
 * gets matches, they are just not filtered from below.
 */
export function priceWindow(c: BuyerCriteria): { min: number | null; max: number | null } {
  const min = c.budgetMin != null ? Math.floor(c.budgetMin * (1 - BUDGET_TOLERANCE)) : null;
  const max = c.budgetMax != null ? Math.ceil(c.budgetMax * (1 + BUDGET_TOLERANCE)) : null;
  return { min, max };
}

/**
 * Split free-text preferred areas into comparable tokens.
 *
 * Agents type these by hand, so the input is inconsistent: "Mont Kiara, Bangsar",
 * "mont kiara / bangsar", "Mont Kiara; KL". Split on the obvious separators, trim,
 * lowercase, and drop anything too short to be a place name — a stray "or" should not
 * match half the database.
 */
export function areaTokens(preferredAreas: string | null): string[] {
  if (!preferredAreas) return [];
  return preferredAreas
    .split(/[,;/|\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
}

/**
 * Does the listing sit in one of the requested areas?
 *
 * Substring in both directions, because "KL" should match "Kuala Lumpur" and
 * "Mont Kiara" should match a listing whose area reads "Mont Kiara / Dutamas".
 */
export function matchesArea(tokens: string[], listing: ListingFacts): boolean {
  if (tokens.length === 0) return false;
  const haystack = `${listing.area} ${listing.state}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t) || t.includes(haystack));
}

/**
 * Score one listing against one buyer.
 *
 * Returns null when the pair is a hard mismatch and should not be shown at all:
 * the wrong kind of listing, or a price outside even the tolerated window.
 *
 * Scoring, out of 100:
 *   40  right listing type (required — a mismatch returns null, never 0)
 *   40  price: full marks inside the stated budget, 25 inside tolerance,
 *       20 when the buyer gave no budget at all (unknown, not bad)
 *   20  area: full marks on a match, 10 when no areas were stated
 *
 * A buyer with no budget and no stated area still scores 70, so the panel is useful
 * on a thin lead — which is exactly when an agent needs a reason to call back.
 */
export function scoreMatch(c: BuyerCriteria, listing: ListingFacts): MatchResult | null {
  const wanted = listingTypeFor(c.interest);
  if (!wanted || listing.listingType !== wanted) return null;

  let score = 40;
  const reasons: string[] = [];

  const { min, max } = priceWindow(c);
  const price = listing.askingPrice;

  if (min != null && price < min) return null;
  if (max != null && price > max) return null;

  const hasBudget = c.budgetMin != null || c.budgetMax != null;
  if (!hasBudget) {
    score += 20;
  } else {
    const insideStated =
      (c.budgetMin == null || price >= c.budgetMin) && (c.budgetMax == null || price <= c.budgetMax);
    if (insideStated) {
      score += 40;
      reasons.push("Within budget");
    } else {
      score += 25;
      reasons.push(price > (c.budgetMax ?? 0) ? "Slightly above budget" : "Slightly below budget");
    }
  }

  const tokens = areaTokens(c.preferredAreas);
  if (tokens.length === 0) {
    score += 10;
  } else if (matchesArea(tokens, listing)) {
    score += 20;
    reasons.push(`In ${listing.area}`);
  }

  return { score, reasons };
}

/** Sort helper: best score first, and stable for equal scores. */
export function byScoreDesc<T extends { match: MatchResult }>(a: T, b: T): number {
  return b.match.score - a.match.score;
}
