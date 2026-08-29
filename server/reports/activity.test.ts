import { describe, it, expect } from "vitest";
import { summariseActivity, type AgentActivityRow } from "./activity";

const row = (name: string, calls: number, whatsapp = 0, leadsTouched = 0): AgentActivityRow => ({
  id: name.toLowerCase(),
  name,
  role: "agent",
  calls,
  whatsapp,
  leadsTouched,
});

describe("summariseActivity", () => {
  it("puts the quietest agent first, because that is the row worth acting on", () => {
    const out = summariseActivity([row("Busy", 20), row("Quiet", 1), row("Middling", 7)], "team", 30);
    expect(out.rows.map((r) => r.name)).toEqual(["Quiet", "Middling", "Busy"]);
  });

  it("ranks on total outreach, not calls alone", () => {
    // Someone working entirely over WhatsApp is not idle.
    const out = summariseActivity([row("Caller", 5, 0), row("Messager", 0, 30)], "team", 30);
    expect(out.rows.map((r) => r.name)).toEqual(["Caller", "Messager"]);
  });

  it("breaks ties on name so the order does not shuffle between loads", () => {
    const out = summariseActivity([row("Zara", 3), row("Adam", 3), row("Mei", 3)], "team", 30);
    expect(out.rows.map((r) => r.name)).toEqual(["Adam", "Mei", "Zara"]);
  });

  it("keeps agents who logged nothing — they are the whole point of the table", () => {
    const out = summariseActivity([row("Active", 9), row("Silent", 0)], "team", 30);
    expect(out.rows.map((r) => r.name)).toEqual(["Silent", "Active"]);
  });

  it("totals calls and WhatsApp separately", () => {
    const out = summariseActivity([row("A", 3, 4), row("B", 2, 1)], "team", 30);
    expect(out.totalCalls).toBe(5);
    expect(out.totalWhatsapp).toBe(5);
  });

  it("reports empty only when nothing at all was logged", () => {
    expect(summariseActivity([row("A", 0), row("B", 0)], "team", 30).empty).toBe(true);
    // One WhatsApp message is still something; the table should render.
    expect(summariseActivity([row("A", 0, 1)], "team", 30).empty).toBe(false);
  });

  it("does not mutate the caller's array", () => {
    const rows = [row("Zara", 9), row("Adam", 1)];
    summariseActivity(rows, "team", 30);
    expect(rows.map((r) => r.name)).toEqual(["Zara", "Adam"]);
  });

  it("carries scope and window through untouched", () => {
    const out = summariseActivity([row("A", 1)], "own", 7);
    expect(out.scope).toBe("own");
    expect(out.sinceDays).toBe(7);
  });
});
