import { describe, expect, it } from "vitest";
import { resolveRange, withParam } from "./range";

// A fixed "now": 15 Sep 2026, 10:00 Malaysia time (02:00 UTC).
const NOW = new Date("2026-09-15T02:00:00Z");
const my = (d: Date) => new Date(d.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);

describe("report date range", () => {
  it("last 7 days includes today and starts six days back", () => {
    const r = resolveRange({ range: "7" }, NOW);
    expect(my(r.from)).toBe("2026-09-09T00:00");
    expect(my(r.to)).toBe("2026-09-15T23:59");
    expect(r.days).toBe(7);
  });

  it("this month starts on the 1st, Malaysia time", () => {
    const r = resolveRange({ range: "this-month" }, NOW);
    expect(my(r.from)).toBe("2026-09-01T00:00");
  });

  it("last month does not overlap this month by even a day", () => {
    const last = resolveRange({ range: "last-month" }, NOW);
    const thisM = resolveRange({ range: "this-month" }, NOW);
    expect(my(last.from)).toBe("2026-08-01T00:00");
    // The boundary is the trap: an off-by-one here double-counts the 1st in both
    // months, and a manager comparing them would never notice.
    expect(last.to.getTime()).toBeLessThan(thisM.from.getTime());
    expect(thisM.from.getTime() - last.to.getTime()).toBe(1);
  });

  it("a custom range covers the whole end day", () => {
    const r = resolveRange({ range: "custom", from: "2026-09-01", to: "2026-09-03" }, NOW);
    expect(my(r.from)).toBe("2026-09-01T00:00");
    expect(my(r.to)).toBe("2026-09-03T23:59");
  });

  it("falls back rather than erroring on a half-finished or reversed custom range", () => {
    // The user is mid-way through choosing. A red box would be wrong.
    expect(resolveRange({ range: "custom", from: "2026-09-05" }, NOW).label).toBe("Last 30 days");
    expect(resolveRange({ range: "custom", from: "2026-09-09", to: "2026-09-01" }, NOW).label).toBe(
      "Last 30 days",
    );
    expect(resolveRange({ range: "custom", from: "nonsense", to: "also" }, NOW).label).toBe("Last 30 days");
  });

  it("ignores a range key we do not offer", () => {
    expect(resolveRange({ range: "'; drop table leads--" }, NOW).label).toBe("Last 30 days");
  });

  it("keeps other filters when one changes", () => {
    expect(withParam({ range: "7", source: "meta", tab: "lead" }, "source", "google")).toContain(
      "source=google",
    );
    expect(withParam({ range: "7", source: "meta" }, "source", "google")).toContain("range=7");
    // Clearing a filter removes it rather than leaving an empty value behind.
    expect(withParam({ range: "7", source: "meta" }, "source", null)).toBe("?range=7");
  });
});
