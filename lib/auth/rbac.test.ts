import { describe, it, expect } from "vitest";
import { canEditAny, canEdit } from "./rbac";
import type { User } from "@/lib/db/schema";

/** Only the fields RBAC actually reads. */
const user = (over: Partial<User>): User =>
  ({ id: "u1", name: "A", role: "agent", teamId: null, active: true, ...over }) as User;

const agent = user({ id: "agent-1", role: "agent" });
const other = user({ id: "agent-2", role: "agent" });
const teamLead = user({ id: "lead-1", role: "team_lead", teamId: "team-1" });
const admin = user({ id: "adm-1", role: "admin" });

describe("canEditAny — setter or closer", () => {
  it("lets the setter edit", () => {
    expect(canEditAny(agent, ["agent-1", "agent-2"])).toBe(true);
  });

  it("lets the CLOSER edit an appointment somebody else set", () => {
    // The bug this replaced: a closer could edit what they could not see.
    expect(canEditAny(agent, ["agent-2", "agent-1"])).toBe(true);
  });

  it("refuses an agent who is neither", () => {
    expect(canEditAny(agent, ["agent-2", "agent-3"])).toBe(false);
  });

  it("treats an absent closer as absent, not as a wildcard", () => {
    // The dangerous failure: null == null matching and granting everyone access.
    expect(canEditAny(agent, ["agent-2", null])).toBe(false);
    expect(canEditAny(agent, [null, null])).toBe(false);
    expect(canEditAny(agent, [])).toBe(false);
  });

  it("still lets the setter edit when there is no closer", () => {
    expect(canEditAny(agent, ["agent-1", null])).toBe(true);
  });

  it("admins edit anything", () => {
    expect(canEditAny(admin, ["agent-2", "agent-3"])).toBe(true);
    expect(canEditAny(admin, [null, null])).toBe(true);
  });

  it("team leads edit their team's records", () => {
    expect(canEditAny(teamLead, ["agent-2", null], "team-1")).toBe(true);
    expect(canEditAny(teamLead, ["agent-2", null], "team-2")).toBe(false);
    // No team on the record: agency-wide data a team lead may edit.
    expect(canEditAny(teamLead, ["agent-2", null])).toBe(true);
  });

  it("agrees with single-column canEdit when there is only one owner", () => {
    for (const owner of ["agent-1", "agent-2", null]) {
      expect(canEditAny(agent, [owner])).toBe(canEdit(agent, owner));
      expect(canEditAny(other, [owner])).toBe(canEdit(other, owner));
      expect(canEditAny(teamLead, [owner])).toBe(canEdit(teamLead, owner));
      expect(canEditAny(admin, [owner])).toBe(canEdit(admin, owner));
    }
  });
});
