import { describe, it, expect } from "vitest";
import {
  formatMYR, pricePerSqft, localInputToIso, isoToLocalInput,
  percentToBp, bpToPercent, formatBp, formatPriceRange,
} from "./utils";

describe("formatMYR", () => {
  it("formats integer cents as Ringgit", () => {
    expect(formatMYR(123456)).toContain("1,234.56");
  });
  it("handles zero", () => {
    expect(formatMYR(0)).toContain("0.00");
  });
  it("renders null and undefined as a dash", () => {
    expect(formatMYR(null)).toBe("—");
    expect(formatMYR(undefined)).toBe("—");
  });
  it("formats a realistic listing price", () => {
    expect(formatMYR(128000000)).toContain("1,280,000");
  });
});

describe("pricePerSqft", () => {
  it("computes RM per square foot", () => {
    // RM 1,280,000 over 1600 sqft = RM 800
    expect(pricePerSqft(128000000, 1600)).toContain("800");
  });
  it("guards a zero or missing area instead of dividing by zero", () => {
    expect(pricePerSqft(128000000, 0)).toBe("—");
    expect(pricePerSqft(128000000, null)).toBe("—");
    expect(pricePerSqft(128000000, undefined)).toBe("—");
  });
});

describe("localInputToIso — follow-up reminders must mean Malaysia time", () => {
  it("interprets a zone-less input as UTC+8", () => {
    // 09:00 in Malaysia is 01:00 UTC the same day.
    expect(localInputToIso("2026-08-12T09:00")).toBe("2026-08-12T01:00:00.000Z");
  });
  it("handles a time that crosses midnight UTC", () => {
    // 07:00 on the 12th in Malaysia is 23:00 UTC on the 11th.
    expect(localInputToIso("2026-08-12T07:00")).toBe("2026-08-11T23:00:00.000Z");
  });
  it("accepts seconds", () => {
    expect(localInputToIso("2026-08-12T09:00:30")).toBe("2026-08-12T01:00:30.000Z");
  });
  it("returns null for empty input", () => {
    expect(localInputToIso("")).toBeNull();
  });
  it("returns null for junk", () => {
    expect(localInputToIso("not a date")).toBeNull();
  });
  it("does not depend on the machine's timezone", () => {
    // The whole point: the same input yields the same instant everywhere.
    const before = process.env.TZ;
    process.env.TZ = "America/New_York";
    const a = localInputToIso("2026-08-12T09:00");
    process.env.TZ = "Asia/Kuala_Lumpur";
    const b = localInputToIso("2026-08-12T09:00");
    process.env.TZ = before;
    expect(a).toBe(b);
  });
});

describe("isoToLocalInput", () => {
  it("round-trips through localInputToIso without shifting", () => {
    const input = "2026-08-12T09:00";
    const iso = localInputToIso(input)!;
    expect(isoToLocalInput(iso)).toBe(input);
  });
  it("shows Malaysia time, not UTC", () => {
    expect(isoToLocalInput("2026-08-12T01:00:00.000Z")).toBe("2026-08-12T09:00");
  });
  it("returns an empty string for null or invalid input", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("nonsense")).toBe("");
  });
});

describe("percentToBp / bpToPercent — rates are integer basis points, like money is cents", () => {
  it("converts a percentage to basis points", () => {
    expect(percentToBp(2.5)).toBe(250);
    expect(percentToBp(2.75)).toBe(275);
    expect(percentToBp(3)).toBe(300);
    expect(percentToBp(100)).toBe(10000);
  });
  it("accepts the string an input element actually produces", () => {
    expect(percentToBp("2.5")).toBe(250);
    expect(percentToBp("")).toBeNull();
  });
  it("returns null for absent values rather than zero", () => {
    // Zero commission and unrecorded commission are different facts.
    expect(percentToBp(null)).toBeNull();
    expect(percentToBp(undefined)).toBeNull();
    expect(percentToBp(0)).toBe(0);
  });
  it("rejects values that are not numbers", () => {
    expect(percentToBp("abc")).toBeNull();
  });
  it("round-trips without drift", () => {
    for (const pct of [0, 1, 2.5, 2.75, 7, 12.34, 100]) {
      expect(bpToPercent(percentToBp(pct))).toBe(pct);
    }
  });
  it("bpToPercent passes null through", () => {
    expect(bpToPercent(null)).toBeNull();
    expect(bpToPercent(undefined)).toBeNull();
  });
});

describe("formatBp", () => {
  it("trims trailing zeros", () => {
    expect(formatBp(250)).toBe("2.5%");
    expect(formatBp(300)).toBe("3%");
    expect(formatBp(275)).toBe("2.75%");
  });
  it("renders zero as zero, not as a dash", () => {
    expect(formatBp(0)).toBe("0%");
  });
  it("renders an unrecorded rate as a dash", () => {
    expect(formatBp(null)).toBe("—");
    expect(formatBp(undefined)).toBe("—");
  });
});

describe("formatPriceRange", () => {
  it("shows a span when unit types differ in price", () => {
    const out = formatPriceRange(46800000, 320000000);
    expect(out).toContain("468,000");
    expect(out).toContain("3,200,000");
    expect(out).toContain("–");
  });
  it("shows a single figure when every unit type costs the same", () => {
    const out = formatPriceRange(46800000, 46800000);
    expect(out).toContain("468,000");
    expect(out).not.toContain("–");
  });
  it("shows a single figure when there is only one unit type", () => {
    expect(formatPriceRange(46800000, null)).toContain("468,000");
  });
  it("says so when nothing is priced yet", () => {
    expect(formatPriceRange(null, null)).toBe("Price on request");
  });
});
