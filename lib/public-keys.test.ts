import { describe, it, expect, beforeEach } from "vitest";
import { resolveLandingPage } from "./public-keys";

describe("resolveLandingPage", () => {
  beforeEach(() => {
    process.env.PUBLIC_LEAD_API_KEYS = "abc123:homepage-form, def456:mont-kiara-lp";
  });

  it("resolves a valid key to its landing page", () => {
    expect(resolveLandingPage("abc123")).toBe("homepage-form");
    expect(resolveLandingPage("def456")).toBe("mont-kiara-lp");
  });
  it("rejects an unknown key", () => {
    expect(resolveLandingPage("nope")).toBeNull();
  });
  it("rejects null", () => {
    expect(resolveLandingPage(null)).toBeNull();
  });
  it("does not match on a prefix of a valid key", () => {
    expect(resolveLandingPage("abc")).toBeNull();
  });
  it("handles a key containing a colon (previously broke the parser)", () => {
    process.env.PUBLIC_LEAD_API_KEYS = "pk:live:xyz:homepage-form";
    // Split on the first colon only: key "pk", slug "live:xyz:homepage-form".
    expect(resolveLandingPage("pk")).toBe("live:xyz:homepage-form");
  });
  it("returns 'unknown' when no slug is configured", () => {
    process.env.PUBLIC_LEAD_API_KEYS = "keyonly";
    expect(resolveLandingPage("keyonly")).toBe("unknown");
  });
  it("returns null when no keys are configured at all", () => {
    process.env.PUBLIC_LEAD_API_KEYS = "";
    expect(resolveLandingPage("abc123")).toBeNull();
  });
});
