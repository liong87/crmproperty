import { describe, it, expect } from "vitest";
import { resolveSplit } from "./co-broke";

const AISYAH = "aaaaaaaa-0000-0000-0000-000000000001"; // sourced the lead
const WEIMING = "bbbbbbbb-0000-0000-0000-000000000002"; // working it now
const RAVI = "cccccccc-0000-0000-0000-000000000003"; // named on the form
const BOOKER = "dddddddd-0000-0000-0000-000000000004"; // whoever pressed the button

describe("resolveSplit", () => {
  it("leaves an ordinary lead exactly as it always was", () => {
    // No hand-off: the owner sets, and nobody is credited as a closer. Getting this
    // wrong would put a phantom closer on every appointment in the agency.
    expect(resolveSplit({ sourcedBy: null, owner: AISYAH, explicitCloser: null, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: null });
  });

  it("splits a handed-over lead between the two agents", () => {
    expect(resolveSplit({ sourcedBy: AISYAH, owner: WEIMING, explicitCloser: null, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: WEIMING });
  });

  it("does not pay one person both halves when a lead comes back", () => {
    // Aisyah handed it to Wei Ming, who handed it back. She is the setter; naming her
    // the closer too would split a commission with herself.
    expect(resolveSplit({ sourcedBy: AISYAH, owner: AISYAH, explicitCloser: null, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: null });
  });

  it("lets a closer named on the form win", () => {
    // A hand-off says how the lead arrived, not who is presenting on the day.
    expect(resolveSplit({ sourcedBy: AISYAH, owner: WEIMING, explicitCloser: RAVI, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: RAVI });
    expect(resolveSplit({ sourcedBy: null, owner: AISYAH, explicitCloser: RAVI, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: RAVI });
  });

  it("falls back to the booker only when nobody owns the client", () => {
    expect(resolveSplit({ sourcedBy: null, owner: null, explicitCloser: null, fallback: BOOKER }))
      .toEqual({ setterId: BOOKER, closerId: null });
  });

  it("keeps the sourcer as setter even if the lead is now unowned", () => {
    // A hand-off to somebody later deactivated leaves assigned_to null. The claim of
    // the person who brought the lead in does not evaporate with it.
    expect(resolveSplit({ sourcedBy: AISYAH, owner: null, explicitCloser: null, fallback: BOOKER }))
      .toEqual({ setterId: AISYAH, closerId: null });
  });
});
