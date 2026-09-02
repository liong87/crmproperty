import { describe, it, expect } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("names the origin, not the plumbing", () => {
    // The bug this fixes: a Meta lead read "Webhook" on screen.
    expect(sourceLabel("webhook", "meta", "meta form 1613980423612055")).toBe("Meta");
  });

  it("falls back to the provider named in the detail", () => {
    expect(sourceLabel("webhook", null, "meta form 1613980423612055")).toBe("Meta");
  });

  it("gives a human word for a transport with no origin", () => {
    expect(sourceLabel("manual", null, null)).toBe("Added by hand");
    expect(sourceLabel("import", null, null)).toBe("CSV import");
    expect(sourceLabel("api", null, null)).toBe("Website");
  });

  it("never shows the word webhook", () => {
    expect(sourceLabel("webhook", null, null).toLowerCase()).not.toContain("webhook");
  });

  it("title-cases an origin it has not been taught", () => {
    expect(sourceLabel("webhook", "red_note", null)).toBe("Red Note");
  });
});
