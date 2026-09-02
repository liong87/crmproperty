import { describe, it, expect } from "vitest";
import { bannerTone } from "./appointment-board";

/**
 * The banner hue is the board's most useful signal — an agent reads urgency from it
 * without reading a date — so the thresholds are pinned rather than eyeballed.
 */
const at = (hoursFromNow: number) => new Date(Date.now() + hoursFromNow * 3_600_000);

describe("appointment banner tone", () => {
  it("flags an overdue Scheduled appointment as rose", () => {
    expect(bannerTone({ scheduledAt: at(-3), status: "scheduled" })).toContain("rose");
  });

  it("does NOT flag a past appointment that already has an outcome", () => {
    // It is not overdue, it is done. Colouring it red would cry wolf on every card in
    // the Showed up and Booked columns.
    expect(bannerTone({ scheduledAt: at(-3), status: "showed-up" })).not.toContain("rose");
  });

  it("uses amber for today", () => {
    expect(bannerTone({ scheduledAt: at(5), status: "scheduled" })).toContain("amber");
  });

  it("uses emerald for the next few days", () => {
    expect(bannerTone({ scheduledAt: at(48), status: "scheduled" })).toContain("emerald");
  });

  it("uses slate for anything further out", () => {
    expect(bannerTone({ scheduledAt: at(24 * 10), status: "scheduled" })).toContain("slate");
  });
});
