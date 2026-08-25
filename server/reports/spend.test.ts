import { describe, it, expect } from "vitest";
import { costPer } from "./spend";

describe("costPer", () => {
  it("divides spend across leads, in integer cents", () => {
    // RM 350.00 across 100 leads = RM 3.50 each.
    expect(costPer(35_000, 100)).toBe(350);
  });

  it("rounds to the nearest cent rather than truncating", () => {
    expect(costPer(1000, 3)).toBe(333);
    expect(costPer(2000, 3)).toBe(667);
  });

  it("returns null when no spend has been recorded, never zero", () => {
    // A campaign with leads but no figure entered has an UNKNOWN cost per lead.
    // Reporting it as RM 0.00 would read as free leads.
    expect(costPer(null, 40)).toBeNull();
  });

  it("returns null when there is nothing to divide by, never Infinity", () => {
    // Money spent, nothing produced. The row still shows the spend; the ratio is
    // undefined and is flagged separately as spendWithoutLeads.
    expect(costPer(50_000, 0)).toBeNull();
    expect(costPer(50_000, -1)).toBeNull();
  });
});
