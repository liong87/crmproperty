import { describe, it, expect } from "vitest";
import {
  areaTokens,
  listingTypeFor,
  matchesArea,
  priceWindow,
  scoreMatch,
  BUDGET_TOLERANCE,
  type BuyerCriteria,
  type ListingFacts,
} from "./score";

/** Prices are integer cents, as stored. RM 800,000 = 80_000_000. */
const rm = (ringgit: number) => ringgit * 100;

const listing = (over: Partial<ListingFacts> = {}): ListingFacts => ({
  listingType: "sale",
  askingPrice: rm(800_000),
  state: "Kuala Lumpur",
  area: "Mont Kiara",
  ...over,
});

const buyer = (over: Partial<BuyerCriteria> = {}): BuyerCriteria => ({
  interest: "buy",
  budgetMin: rm(700_000),
  budgetMax: rm(900_000),
  preferredAreas: "Mont Kiara, Bangsar",
  ...over,
});

describe("listingTypeFor", () => {
  it("maps buying intents to sale listings", () => {
    expect(listingTypeFor("buy")).toBe("sale");
    expect(listingTypeFor("invest")).toBe("sale");
  });

  it("maps renting to rental listings", () => {
    expect(listingTypeFor("rent")).toBe("rent");
  });

  it("returns null for vendors — a seller is not shopping", () => {
    expect(listingTypeFor("sell")).toBeNull();
  });

  it("returns null rather than guessing when interest is missing", () => {
    expect(listingTypeFor(null)).toBeNull();
    expect(listingTypeFor("")).toBeNull();
    expect(listingTypeFor("something else")).toBeNull();
  });

  it("tolerates casing and stray whitespace from imports", () => {
    expect(listingTypeFor("  BUY ")).toBe("sale");
  });
});

describe("priceWindow", () => {
  it("widens the stated budget by the tolerance", () => {
    const w = priceWindow(buyer());
    expect(w.min).toBe(Math.floor(rm(700_000) * (1 - BUDGET_TOLERANCE)));
    expect(w.max).toBe(Math.ceil(rm(900_000) * (1 + BUDGET_TOLERANCE)));
  });

  it("leaves an unstated bound open rather than inventing one", () => {
    expect(priceWindow(buyer({ budgetMin: null })).min).toBeNull();
    expect(priceWindow(buyer({ budgetMax: null })).max).toBeNull();
  });
});

describe("areaTokens", () => {
  it("splits on the separators agents actually type", () => {
    expect(areaTokens("Mont Kiara, Bangsar")).toEqual(["mont kiara", "bangsar"]);
    expect(areaTokens("Mont Kiara / Bangsar")).toEqual(["mont kiara", "bangsar"]);
    expect(areaTokens("Mont Kiara; Bangsar")).toEqual(["mont kiara", "bangsar"]);
  });

  it("drops fragments too short to be a place name", () => {
    // A stray "or" would otherwise substring-match a large share of the table.
    expect(areaTokens("KL, or, Bangsar")).toEqual(["bangsar"]);
  });

  it("returns nothing when no areas were given", () => {
    expect(areaTokens(null)).toEqual([]);
    expect(areaTokens("")).toEqual([]);
  });
});

describe("matchesArea", () => {
  it("matches on the area", () => {
    expect(matchesArea(["mont kiara"], listing())).toBe(true);
  });

  it("matches on the state, so a broad request still works", () => {
    expect(matchesArea(["kuala lumpur"], listing())).toBe(true);
  });

  it("matches a compound listing area", () => {
    expect(matchesArea(["mont kiara"], listing({ area: "Mont Kiara / Dutamas" }))).toBe(true);
  });

  it("does not match an unrelated area", () => {
    expect(matchesArea(["penang"], listing())).toBe(false);
  });

  it("never matches when no areas were stated", () => {
    expect(matchesArea([], listing())).toBe(false);
  });
});

describe("scoreMatch", () => {
  it("rejects the wrong listing type outright", () => {
    expect(scoreMatch(buyer({ interest: "rent" }), listing({ listingType: "sale" }))).toBeNull();
  });

  it("rejects vendors", () => {
    expect(scoreMatch(buyer({ interest: "sell" }), listing())).toBeNull();
  });

  it("scores a full match highest", () => {
    const r = scoreMatch(buyer(), listing());
    expect(r).not.toBeNull();
    expect(r!.score).toBe(100);
    expect(r!.reasons).toContain("Within budget");
    expect(r!.reasons).toContain("In Mont Kiara");
  });

  it("still shows a listing slightly over budget, and says so", () => {
    // RM 950k against a RM 900k ceiling: outside the stated budget, inside tolerance.
    const r = scoreMatch(buyer(), listing({ askingPrice: rm(950_000) }));
    expect(r).not.toBeNull();
    expect(r!.reasons).toContain("Slightly above budget");
    expect(r!.score).toBeLessThan(100);
  });

  it("rejects a listing beyond the tolerated window", () => {
    // RM 1.2m against a RM 900k ceiling — well past +10%.
    expect(scoreMatch(buyer(), listing({ askingPrice: rm(1_200_000) }))).toBeNull();
  });

  it("rejects a listing below the tolerated floor", () => {
    expect(scoreMatch(buyer(), listing({ askingPrice: rm(200_000) }))).toBeNull();
  });

  it("still returns matches for a lead with no budget recorded", () => {
    // The thin-lead case: this panel has to be useful before qualification, or
    // agents will not open it.
    const r = scoreMatch(buyer({ budgetMin: null, budgetMax: null }), listing());
    expect(r).not.toBeNull();
    expect(r!.score).toBeGreaterThanOrEqual(70);
  });

  it("scores an area match above a non-match, all else equal", () => {
    const hit = scoreMatch(buyer(), listing({ area: "Mont Kiara" }))!;
    const miss = scoreMatch(buyer(), listing({ area: "Cheras" }))!;
    expect(hit.score).toBeGreaterThan(miss.score);
  });

  it("treats an unstated area as unknown rather than wrong", () => {
    const unstated = scoreMatch(buyer({ preferredAreas: null }), listing())!;
    const wrongArea = scoreMatch(buyer(), listing({ area: "Cheras" }))!;
    expect(unstated.score).toBeGreaterThan(wrongArea.score);
  });

  it("matches investors to sale listings", () => {
    expect(scoreMatch(buyer({ interest: "invest" }), listing({ listingType: "sale" }))).not.toBeNull();
  });

  it("matches renters to rental listings", () => {
    const r = scoreMatch(
      buyer({ interest: "rent", budgetMin: rm(2_000), budgetMax: rm(3_500) }),
      listing({ listingType: "rent", askingPrice: rm(3_000) }),
    );
    expect(r).not.toBeNull();
    expect(r!.reasons).toContain("Within budget");
  });
});
