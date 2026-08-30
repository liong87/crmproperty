import { describe, expect, it } from "vitest";
import {
  BP_TOTAL, allocate, bpToPct, grossCommission, pctToBp, releaseStages,
  splitCommission, validateSplit, validateStages,
} from "./calc";

describe("allocate", () => {
  it("sums to exactly the total, even when the division is not clean", () => {
    // The classic loss: three equal shares of 100 floor to 33 and drop a cent.
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("gives the odd cent to the largest remainder, not the first row", () => {
    // 10 split 1:1:8 -> exact 1, 1, 8. Add one more cent: 1.1, 1.1, 8.8.
    expect(allocate(11, [1000, 1000, 8000])).toEqual([1, 1, 9]);
  });

  it("is deterministic when remainders tie", () => {
    expect(allocate(10, [1, 1, 1])).toEqual(allocate(10, [1, 1, 1]));
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("handles a total of zero and weights of zero", () => {
    expect(allocate(0, [5000, 5000])).toEqual([0, 0]);
    expect(allocate(100, [0, 0])).toEqual([0, 0]);
    expect(allocate(100, [])).toEqual([]);
  });

  it("never loses or invents a cent across many awkward splits", () => {
    for (let total = 0; total < 400; total++) {
      for (const w of [[3333, 3333, 3334], [1, 2, 3], [7000, 2000, 1000], [1, 1, 1, 1, 1, 1, 1]]) {
        const parts = allocate(total, w);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts.every((p) => p >= 0)).toBe(true);
      }
    }
  });
});

describe("grossCommission", () => {
  it("computes basis points of a price in cents", () => {
    // RM 750,000.00 at 2.50%  =  RM 18,750.00
    expect(grossCommission(75_000_000, 250)).toBe(1_875_000);
  });

  it("returns zero rather than a negative for missing inputs", () => {
    expect(grossCommission(0, 250)).toBe(0);
    expect(grossCommission(75_000_000, 0)).toBe(0);
    expect(grossCommission(-1, 250)).toBe(0);
  });

  it("rounds to the cent", () => {
    // 1 cent at 50% is half a cent.
    expect(grossCommission(1, 5000)).toBe(1);
  });
});

describe("splitCommission", () => {
  const parties = [
    { party: "agency" as const, label: "Agency", shareBp: 5000 },
    { party: "setter" as const, label: "Nurul", shareBp: 2500 },
    { party: "closer" as const, label: "Ravi", shareBp: 2500 },
    { party: "co-broke" as const, label: "", shareBp: 0 },
  ];

  it("splits and drops the empty party", () => {
    const out = splitCommission(1_875_000, parties);
    expect(out).toHaveLength(3);
    expect(out.map((o) => o.amount)).toEqual([937_500, 468_750, 468_750]);
  });

  it("always sums to the gross", () => {
    for (const gross of [1, 7, 99, 100, 1_875_001, 3_333_333]) {
      const out = splitCommission(gross, parties);
      expect(out.reduce((a, o) => a + o.amount, 0)).toBe(gross);
    }
  });

  it("keeps a co-broke party when it has a share", () => {
    const out = splitCommission(1000, [
      { party: "agency", label: "Agency", shareBp: 5000 },
      { party: "co-broke", label: "Partner", shareBp: 5000 },
    ]);
    expect(out.map((o) => o.party)).toEqual(["agency", "co-broke"]);
  });
});

describe("releaseStages", () => {
  const stages = [
    { label: "Booking", releaseBp: 2000, sortOrder: 0 },
    { label: "SPA signed", releaseBp: 3000, sortOrder: 1 },
    { label: "Loan approved", releaseBp: 3000, sortOrder: 2 },
    { label: "Completion", releaseBp: 2000, sortOrder: 3 },
  ];

  it("spreads the gross across the stages", () => {
    const out = releaseStages(1_875_000, stages);
    expect(out.map((s) => s.amount)).toEqual([375_000, 562_500, 562_500, 375_000]);
  });

  it("sums to the gross whatever the figure", () => {
    for (const gross of [1, 3, 101, 999_999, 1_234_567]) {
      expect(releaseStages(gross, stages).reduce((a, s) => a + s.amount, 0)).toBe(gross);
    }
  });
});

describe("validation", () => {
  it("rejects release stages that do not total 100%", () => {
    expect(validateStages([{ releaseBp: 5000 }, { releaseBp: 4000 }]))
      .toContain("90.00%");
    expect(validateStages([{ releaseBp: 5000 }, { releaseBp: 5000 }])).toBeNull();
    expect(validateStages([])).toContain("at least one");
  });

  it("rejects a split that does not total 100%", () => {
    expect(validateSplit({ agencyBp: 5000, setterBp: 2500, closerBp: 2000, coBrokeBp: 0 }))
      .toContain("95.00%");
    expect(validateSplit({ agencyBp: 5000, setterBp: 2500, closerBp: 2500, coBrokeBp: 0 }))
      .toBeNull();
  });
});

describe("percent conversion", () => {
  it("round-trips the rates an agency actually types", () => {
    for (const pct of [0, 0.5, 2.5, 3, 12.75, 100]) {
      expect(bpToPct(pctToBp(pct)!)).toBe(pct);
    }
  });

  it("refuses impossible rates rather than clamping them", () => {
    expect(pctToBp(-1)).toBeNull();
    expect(pctToBp(101)).toBeNull();
    expect(pctToBp(Number.NaN)).toBeNull();
  });

  it("BP_TOTAL is one hundred percent", () => {
    expect(bpToPct(BP_TOTAL)).toBe(100);
  });
});
