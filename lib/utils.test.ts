import { describe, it, expect } from "vitest";
import { formatMYR, pricePerSqft, localInputToIso, isoToLocalInput } from "./utils";

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
