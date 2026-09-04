import { describe, it, expect } from "vitest";
import { who } from "./user-name";

const ME = "11111111-1111-1111-1111-111111111111";
const THEM = "22222222-2222-2222-2222-222222222222";

describe("who", () => {
  it("marks your own name", () => {
    expect(who("Rodney Liong", ME, ME)).toBe("Rodney Liong (You)");
  });

  it("leaves a colleague's name alone", () => {
    expect(who("Nurul Izzah", THEM, ME)).toBe("Nurul Izzah");
  });

  it("states that nobody owns it rather than rendering blank", () => {
    // An empty cell reads as a rendering glitch; a lead nobody owns must be noticed.
    expect(who(null, THEM, ME)).toBe("Unassigned");
    expect(who("", THEM, ME)).toBe("Unassigned");
    expect(who(undefined, null, ME)).toBe("Unassigned");
  });

  it("does not claim an unowned row as yours", () => {
    // The bug this guards: `null === null` is true, so a row with no owner viewed
    // without a signed-in id would have announced itself as you.
    expect(who("Nobody", null, null)).toBe("Nobody");
    expect(who("Nobody", null, ME)).toBe("Nobody");
    expect(who("Nobody", THEM, null)).toBe("Nobody");
  });
});
