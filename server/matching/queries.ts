import { and, desc, eq, gte, isNull, lte, ne, notInArray, or, type SQL } from "drizzle-orm";
import { DEAD_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db/client";
import { leads, contacts, properties } from "@/lib/db/schema";
import type { User } from "@/lib/db/schema";
import { ownershipFilter } from "@/lib/auth";
import {
  byScoreDesc,
  listingTypeFor,
  priceWindow,
  scoreMatch,
  type BuyerCriteria,
  type MatchResult,
} from "./score";

const MAX_RESULTS = 6;
/** Candidate rows pulled before scoring. Wide enough to rank well, small enough to stay fast. */
const CANDIDATE_LIMIT = 60;

export interface ListingMatch {
  id: string;
  title: string;
  area: string;
  state: string;
  propertyType: string;
  askingPrice: number;
  bedrooms: number | null;
  match: MatchResult;
}

export interface BuyerMatch {
  id: string;
  kind: "lead" | "contact";
  name: string;
  phone: string;
  budgetMin: number | null;
  budgetMax: number | null;
  preferredAreas: string | null;
  match: MatchResult;
}

/**
 * Listings that suit this buyer.
 *
 * NOT ownership-scoped, deliberately. Listings are shared agency inventory — every
 * agent can already open any property — and a matcher that only showed an agent their
 * own listings would miss the colleague's unit that is the obvious fit. Client records
 * are the private half of this system; stock is not.
 *
 * The SQL narrows on the cheap, indexed columns (status, listing type, price window)
 * and scoring ranks what returns. Area matching is free text and stays in TypeScript,
 * where it can be forgiving without becoming an unindexed LIKE across the table.
 */
export async function findListingsForBuyer(criteria: BuyerCriteria): Promise<ListingMatch[]> {
  const wanted = listingTypeFor(criteria.interest);
  // Vendors and unknown interest get nothing — see listingTypeFor.
  if (!wanted) return [];

  const { min, max } = priceWindow(criteria);
  const conditions: (SQL | undefined)[] = [
    isNull(properties.deletedAt),
    eq(properties.status, "active"),
    eq(properties.listingType, wanted),
    min != null ? gte(properties.askingPrice, min) : undefined,
    max != null ? lte(properties.askingPrice, max) : undefined,
  ];

  const rows = await db
    .select({
      id: properties.id,
      title: properties.title,
      area: properties.area,
      state: properties.state,
      propertyType: properties.propertyType,
      askingPrice: properties.askingPrice,
      bedrooms: properties.bedrooms,
      listingType: properties.listingType,
    })
    .from(properties)
    .where(and(...conditions))
    .limit(CANDIDATE_LIMIT);

  return rows
    .map((r) => {
      const match = scoreMatch(criteria, r);
      return match ? { ...r, match } : null;
    })
    .filter((r): r is ListingMatch & { listingType: string } => r !== null)
    .sort(byScoreDesc)
    .slice(0, MAX_RESULTS);
}

/**
 * Buyers who might want this listing — the reverse view, shown on a property.
 *
 * This one IS ownership-scoped: an agent sees only their own leads and contacts, a
 * manager or admin sees everyone's. Client records are private between agents, and a
 * matching panel would otherwise be a convenient way to browse a colleague's book.
 *
 * Disqualified and already-converted leads are excluded — a lead that became a
 * contact would otherwise appear twice, once under each identity.
 */
export async function findBuyersForListing(
  user: User,
  listing: { listingType: string; askingPrice: number; state: string; area: string },
): Promise<BuyerMatch[]> {
  // Which interests could want this listing? Mirrors listingTypeFor.
  const interests = listing.listingType === "sale" ? ["buy", "invest"] : ["rent"];
  const interestMatch = (col: typeof leads.interest | typeof contacts.interest) =>
    or(...interests.map((i) => eq(col, i)));

  const [leadRows, contactRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        name: leads.name,
        phone: leads.phone,
        interest: leads.interest,
        budgetMin: leads.budgetMin,
        budgetMax: leads.budgetMax,
        preferredAreas: leads.preferredAreas,
      })
      .from(leads)
      .where(
        and(
          isNull(leads.deletedAt),
          isNull(leads.convertedToContactId),
          notInArray(leads.status, DEAD_STATUSES),
          interestMatch(leads.interest),
          ownershipFilter(user, leads.assignedTo),
        ),
      )
      .limit(CANDIDATE_LIMIT),
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        interest: contacts.interest,
        budgetMin: contacts.budgetMin,
        budgetMax: contacts.budgetMax,
        preferredAreas: contacts.preferredAreas,
      })
      .from(contacts)
      .where(
        and(
          isNull(contacts.deletedAt),
          interestMatch(contacts.interest),
          ownershipFilter(user, contacts.assignedTo),
        ),
      )
      .limit(CANDIDATE_LIMIT),
  ]);

  const scored: BuyerMatch[] = [];
  for (const [kind, rows] of [
    ["lead", leadRows],
    ["contact", contactRows],
  ] as const) {
    for (const r of rows) {
      const match = scoreMatch(r, listing);
      if (match) {
        scored.push({
          id: r.id,
          kind,
          name: r.name,
          phone: r.phone,
          budgetMin: r.budgetMin,
          budgetMax: r.budgetMax,
          preferredAreas: r.preferredAreas,
          match,
        });
      }
    }
  }

  return scored.sort(byScoreDesc).slice(0, MAX_RESULTS);
}

export interface PickableListing {
  id: string;
  title: string;
  area: string;
  askingPrice: number;
}

/**
 * Active listings an agent can reference in a message.
 *
 * Templates like "here are the details for {{property}}" need a listing, and a lead
 * has none attached — which is why picking that template produced a sentence ending
 * in a colon. This supplies the choices.
 *
 * Not ownership-scoped, for the same reason as findListingsForBuyer: stock is shared
 * across the agency. Ordered newest first, since a message about a listing is usually
 * about a recent one.
 */
export async function listPickableListings(limit = 50): Promise<PickableListing[]> {
  return db
    .select({
      id: properties.id,
      title: properties.title,
      area: properties.area,
      askingPrice: properties.askingPrice,
    })
    .from(properties)
    .where(and(isNull(properties.deletedAt), eq(properties.status, "active")))
    .orderBy(desc(properties.createdAt))
    .limit(limit);
}
