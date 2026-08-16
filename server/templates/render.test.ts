import { describe, it, expect } from "vitest";
import { renderTemplate, placeholdersUsed, missingValues } from "./render";

describe("renderTemplate", () => {
  it("substitutes values", () => {
    expect(renderTemplate("Hi {{name}}, welcome.", { name: "Ali" })).toBe("Hi Ali, welcome.");
  });

  it("substitutes the same placeholder more than once", () => {
    expect(renderTemplate("{{name}}? Yes, {{name}}.", { name: "Ali" })).toBe("Ali? Yes, Ali.");
  });

  it("tolerates spacing and casing, because templates are typed in a hurry", () => {
    expect(renderTemplate("Hi {{ name }}", { name: "Ali" })).toBe("Hi Ali");
    expect(renderTemplate("Hi {{Name}}", { name: "Ali" })).toBe("Hi Ali");
  });

  it("removes a placeholder with no value rather than printing braces", () => {
    // Sending a client "Hi {{name}}" is worse than sending "Hi".
    expect(renderTemplate("Hi {{name}}", {})).toBe("Hi");
  });

  it("removes an unknown placeholder", () => {
    expect(renderTemplate("Hi {{nonsense}} there", { name: "Ali" })).toBe("Hi there");
  });

  it("treats an empty or whitespace value as missing", () => {
    expect(renderTemplate("Hi {{name}}!", { name: "" })).toBe("Hi!");
    expect(renderTemplate("Hi {{name}}!", { name: "   " })).toBe("Hi!");
  });

  it("tidies the comma left behind by a missing value", () => {
    expect(renderTemplate("Hi {{name}}, welcome.", {})).toBe("Hi, welcome.");
  });

  it("does not leave a space before punctuation", () => {
    expect(renderTemplate("Viewing at {{property}}.", {})).toBe("Viewing at.");
  });

  it("collapses the double space a removed value leaves mid-sentence", () => {
    expect(renderTemplate("at {{property}} on Saturday", {})).toBe("at on Saturday");
  });

  it("trims surrounding whitespace", () => {
    expect(renderTemplate("  Hi {{name}}  ", { name: "Ali" })).toBe("Hi Ali");
  });

  it("keeps deliberate line breaks", () => {
    const out = renderTemplate("Hi {{name}},\nThanks for coming.", { name: "Ali" });
    expect(out).toBe("Hi Ali,\nThanks for coming.");
  });

  it("fills a realistic viewing confirmation", () => {
    const body = "Hi {{name}}, confirming our viewing at {{property}}. — {{agent}}";
    expect(
      renderTemplate(body, { name: "Ali", property: "Vista Kiara 3-bed", agent: "Rodney" }),
    ).toBe("Hi Ali, confirming our viewing at Vista Kiara 3-bed. — Rodney");
  });

  it("trims values, so a stray space in a record does not show", () => {
    expect(renderTemplate("Hi {{name}}", { name: "  Ali  " })).toBe("Hi Ali");
  });
});

describe("placeholdersUsed", () => {
  it("lists them in order, without duplicates", () => {
    expect(placeholdersUsed("{{name}} at {{property}}, {{name}}")).toEqual(["name", "property"]);
  });

  it("returns nothing for a template with no placeholders", () => {
    expect(placeholdersUsed("Thanks for your time.")).toEqual([]);
  });
});

describe("missingValues", () => {
  it("reports placeholders the record cannot fill", () => {
    const body = "Hi {{name}}, about {{property}} in {{area}}";
    expect(missingValues(body, { name: "Ali" })).toEqual(["property", "area"]);
  });

  it("reports nothing when every placeholder has a value", () => {
    expect(missingValues("Hi {{name}}", { name: "Ali" })).toEqual([]);
  });

  it("counts an empty string as missing", () => {
    expect(missingValues("Hi {{name}}", { name: "" })).toEqual(["name"]);
  });
});

describe("alias handling — templates written by different hands", () => {
  it("accepts propertyTitle as property", () => {
    expect(renderTemplate("Details for {{propertyTitle}}", { property: "Vista Kiara" })).toBe(
      "Details for Vista Kiara",
    );
  });

  it("accepts snake_case variants", () => {
    expect(renderTemplate("Details for {{property_title}}", { property: "Vista Kiara" })).toBe(
      "Details for Vista Kiara",
    );
  });

  it("accepts clientName and agentName", () => {
    expect(renderTemplate("{{clientName}} / {{agentName}}", { name: "Ali", agent: "Rodney" })).toBe(
      "Ali / Rodney",
    );
  });

  it("reports an unfillable placeholder rather than dropping it silently", () => {
    // The bug this covers: a seeded template using {{url}} rendered as
    // "here are the details for:" with nothing after the colon, and no warning.
    const body = "Hi {{name}}, here are the details for {{propertyTitle}}: {{url}}";
    expect(missingValues(body, { name: "Ali" })).toEqual(["propertyTitle", "url"]);
  });

  it("reports nothing once the values exist", () => {
    const body = "Details for {{propertyTitle}}";
    expect(missingValues(body, { property: "Vista Kiara" })).toEqual([]);
  });
});
