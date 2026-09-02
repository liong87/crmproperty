import { describe, it, expect } from "vitest";
import { buildPath, rampIndex, pct } from "./funnel-band";

describe("funnel band geometry", () => {
  it("never collapses a zero stage to nothing", () => {
    // The failure this floor prevents: an empty stage renders zero-height, the band
    // looks severed, and it reads as a rendering fault rather than "nobody got here".
    const d = buildPath([1, 1, 0, 0, 0], 1, 0);
    expect(d).not.toContain("NaN");
    // 0.2 floor either side of the 50 centre line.
    expect(d).toContain("49.8");
    expect(d).toContain("50.2");
  });

  it("survives an all-zero funnel", () => {
    const d = buildPath([0, 0, 0, 0, 0], 0, 0);
    expect(d).not.toContain("NaN");
    expect(d).not.toContain("Infinity");
  });

  it("closes the path", () => {
    expect(buildPath([248, 96, 61, 22, 14], 248, 0).trimEnd().endsWith("Z")).toBe(true);
  });

  it("spreads the ramp so any stage count still ends on the darkest green", () => {
    expect(rampIndex(0, 5)).toBe(1);
    expect(rampIndex(4, 5)).toBe(5);
    // Four stages must still finish dark rather than stopping at stage 4.
    expect(rampIndex(0, 4)).toBe(1);
    expect(rampIndex(3, 4)).toBe(5);
    expect(rampIndex(0, 1)).toBe(5);
  });

  it("returns 0% rather than NaN when the denominator is zero", () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(22, 61)).toBe(36.1);
  });
});
