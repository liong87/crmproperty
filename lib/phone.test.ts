import { describe, it, expect } from "vitest";
import { toE164, isE164 } from "./phone";

describe("toE164 — Malaysian numbers as real forms supply them", () => {
  it("passes through a number that is already E.164", () => {
    expect(toE164("+60123456789")).toBe("+60123456789");
  });
  it("strips the formatting people type", () => {
    expect(toE164("+60 12-345 6789")).toBe("+60123456789");
    expect(toE164("012-345 6789")).toBe("+60123456789");
    expect(toE164("(012) 3456789")).toBe("+60123456789");
  });
  it("drops the trunk zero when adding the country code", () => {
    expect(toE164("0123456789")).toBe("+60123456789");
    expect(toE164("0198765432")).toBe("+60198765432");
  });
  it("accepts a country code supplied without a plus", () => {
    expect(toE164("60123456789")).toBe("+60123456789");
  });
  it("handles the 00 international prefix", () => {
    expect(toE164("0060123456789")).toBe("+60123456789");
  });
  it("assumes Malaysia only for a plausibly-sized bare number", () => {
    expect(toE164("123456789")).toBe("+60123456789");
  });
  it("refuses to guess rather than storing a wrong number", () => {
    // Too short to be a phone number at all.
    expect(toE164("12345")).toBeNull();
    // Too long to be a national number missing its zero.
    expect(toE164("123456789012")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164("not a phone")).toBeNull();
  });
  it("supports another country when told", () => {
    expect(toE164("+6591234567", "65")).toBe("+6591234567");
    expect(toE164("91234567", "65")).toBe("+6591234567");
  });
  it("never returns something that is not valid E.164", () => {
    for (const input of ["0", "+", "++60", "0000000000", "abc123"]) {
      const out = toE164(input);
      expect(out === null || isE164(out)).toBe(true);
    }
  });
});

describe("isE164", () => {
  it("accepts valid numbers", () => {
    expect(isE164("+60123456789")).toBe(true);
  });
  it("rejects a missing plus, a leading zero, and junk", () => {
    expect(isE164("60123456789")).toBe(false);
    expect(isE164("+0123456789")).toBe(false);
    expect(isE164("+60 12 345")).toBe(false);
  });
});
