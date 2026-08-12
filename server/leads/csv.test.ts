import { describe, it, expect } from "vitest";
import {
  parseCsv,
  ringgitToCents,
  toE164My,
  toInterest,
  toConsent,
  pick,
  normaliseHeader,
} from "./csv";

describe("ringgitToCents", () => {
  it("converts plain Ringgit to cents", () => {
    expect(ringgitToCents("850000")).toBe(85_000_000);
  });
  it("handles thousands separators (previously produced NaN and killed the row)", () => {
    expect(ringgitToCents("1,200,000")).toBe(120_000_000);
  });
  it("handles a currency prefix", () => {
    expect(ringgitToCents("RM 850000")).toBe(85_000_000);
    expect(ringgitToCents("rm850,000")).toBe(85_000_000);
    expect(ringgitToCents("MYR 1,000")).toBe(100_000);
  });
  it("handles k and m shorthand", () => {
    expect(ringgitToCents("850k")).toBe(85_000_000);
    expect(ringgitToCents("1.2m")).toBe(120_000_000);
  });
  it("handles decimals", () => {
    expect(ringgitToCents("1234.56")).toBe(123_456);
  });
  it("returns 0 for zero, not null", () => {
    expect(ringgitToCents("0")).toBe(0);
  });
  it("returns null for empty and unparseable input rather than NaN", () => {
    expect(ringgitToCents("")).toBeNull();
    expect(ringgitToCents(null)).toBeNull();
    expect(ringgitToCents(undefined)).toBeNull();
    expect(ringgitToCents("abc")).toBeNull();
    expect(ringgitToCents("1.2.3")).toBeNull();
    expect(ringgitToCents("-500")).toBeNull();
  });
  it("never returns NaN for any input", () => {
    for (const v of ["", "abc", "RM", "1,,2", "..", "k", "1e5000"]) {
      const r = ringgitToCents(v);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });
});

describe("toE164My", () => {
  it("accepts an already-valid E.164 number", () => {
    expect(toE164My("+60123456789")).toBe("+60123456789");
  });
  it("converts a local Malaysian number", () => {
    expect(toE164My("0123456789")).toBe("+60123456789");
  });
  it("strips dashes, spaces and brackets", () => {
    expect(toE164My("012-345 6789")).toBe("+60123456789");
    expect(toE164My("+60 12 3456 789")).toBe("+60123456789");
  });
  it("handles 00 international prefix", () => {
    expect(toE164My("0060123456789")).toBe("+60123456789");
  });
  it("handles a bare 60-prefixed number", () => {
    expect(toE164My("60123456789")).toBe("+60123456789");
  });
  it("rejects junk", () => {
    expect(toE164My("")).toBeNull();
    expect(toE164My("not a phone")).toBeNull();
    expect(toE164My("+0123")).toBeNull();
  });
});

describe("toInterest", () => {
  it("accepts lowercase values", () => {
    expect(toInterest("buy")).toBe("buy");
  });
  it("accepts capitalised values (how humans type them)", () => {
    expect(toInterest("Buy")).toBe("buy");
    expect(toInterest(" RENT ")).toBe("rent");
    expect(toInterest("Sell")).toBe("sell");
  });
  it("maps common variants", () => {
    expect(toInterest("purchase")).toBe("buy");
    expect(toInterest("rental")).toBe("rent");
    expect(toInterest("jual")).toBe("sell");
  });
  it("returns null for unknown values instead of failing the row", () => {
    expect(toInterest("maybe")).toBeNull();
    expect(toInterest("")).toBeNull();
    expect(toInterest(null)).toBeNull();
  });
});

describe("toConsent", () => {
  it("recognises affirmative values", () => {
    for (const v of ["true", "Yes", "Y", "1", "on", "AGREE", "setuju"]) {
      expect(toConsent(v)).toBe(true);
    }
  });
  it("defaults to false — consent is never assumed", () => {
    expect(toConsent("")).toBe(false);
    expect(toConsent(undefined)).toBe(false);
    expect(toConsent(null)).toBe(false);
    expect(toConsent("no")).toBe(false);
    expect(toConsent("maybe")).toBe(false);
  });
});

describe("normaliseHeader / pick", () => {
  it("collapses header spellings to one key", () => {
    expect(normaliseHeader("Budget Min")).toBe("budgetmin");
    expect(normaliseHeader("budget_min")).toBe("budgetmin");
    expect(normaliseHeader("BUDGET-MIN")).toBe("budgetmin");
  });
  it("picks the first present alternative", () => {
    const values = { fullname: "Ali", phonenumber: "+60123456789" };
    expect(pick(values, "name", "full name")).toBe("Ali");
    expect(pick(values, "phone", "phone_number")).toBe("+60123456789");
    expect(pick(values, "email")).toBe("");
  });
});

describe("parseCsv", () => {
  it("parses a simple file", () => {
    const rows = parseCsv("name,phone\nAli,+60123456789\nSiti,+60129876543");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.values.name).toBe("Ali");
    expect(rows[1]!.values.phone).toBe("+60129876543");
  });

  it("reports the TRUE source line even when blank lines are present", () => {
    // Blank line at position 2 used to shift every later error number by one.
    const rows = parseCsv("name,phone\n\nAli,+60123456789\n\n\nSiti,+60129876543");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.line).toBe(3); // Ali is physically on line 3
    expect(rows[1]!.line).toBe(6); // Siti on line 6
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('name,areas\nAli,"Mont Kiara, Bangsar"');
    expect(rows[0]!.values.areas).toBe("Mont Kiara, Bangsar");
  });

  it("handles escaped quotes", () => {
    const rows = parseCsv('name,note\nAli,"He said ""yes"""');
    expect(rows[0]!.values.note).toBe('He said "yes"');
  });

  it("handles newlines inside quoted fields", () => {
    const rows = parseCsv('name,note\nAli,"line one\nline two"\nSiti,ok');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.values.note).toBe("line one\nline two");
    expect(rows[1]!.values.name).toBe("Siti");
    expect(rows[1]!.line).toBe(4); // the embedded newline must not desync line counting
  });

  it("strips a UTF-8 BOM from the first header", () => {
    const rows = parseCsv("﻿name,phone\nAli,+60123456789");
    expect(rows[0]!.values.name).toBe("Ali");
  });

  it("handles CRLF line endings", () => {
    const rows = parseCsv("name,phone\r\nAli,+60123456789\r\n");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.values.name).toBe("Ali");
  });

  it("returns an empty array for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });

  it("normalises header spellings, so Facebook/Google exports map directly", () => {
    const rows = parseCsv("Full Name,Phone Number,Budget Min\nAli,0123456789,1,200,000");
    expect(rows[0]!.values.fullname).toBe("Ali");
    expect(rows[0]!.values.phonenumber).toBe("0123456789");
  });
});
