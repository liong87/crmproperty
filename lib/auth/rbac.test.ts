import { describe, it, expect } from "vitest";
import { canEditAny, canEdit } from "./rbac";
import type { User } from "@/lib/db/schema";

/** Only the fields RBAC actually reads. */
const user = (over: Partial<User>): User =>
  ({ id: "u1", name: "A", role: "agent", teamId: null, active: true, ...over }) as User;

const agent = user({ id: "agent-1", role: "agent" });
const other = user({ id: "agent-2", role: "agent" });
const teamLead = user({ id: "lead-1", role: "team_lead" });
const admin = user({ id: "adm-1", role: "admin" });

/**
 * The set a team lead may write: themselves plus their downline, as `visibleUserIds`
 * resolves it from `users.team_lead_id`. Agents and admins never consult it.
 */
const MY_TEAM = ["lead-1", "agent-1"];
const NONE: string[] = [];

describe("canEdit — write scope must not exceed read scope", () => {
  it("an agent edits only their own", () => {
    expect(canEdit(agent, "agent-1", ["agent-1"])).toBe(true);
    expect(canEdit(agent, "agent-2", ["agent-1"])).toBe(false);
    expect(canEdit(agent, null, ["agent-1"])).toBe(false);
  });

  it("an admin edits anything", () => {
    expect(canEdit(admin, "agent-2", NONE)).toBe(true);
    expect(canEdit(admin, null, NONE)).toBe(true);
  });

  it("a team lead edits their own downline", () => {
    expect(canEdit(teamLead, "agent-1", MY_TEAM)).toBe(true);
    expect(canEdit(teamLead, "lead-1", MY_TEAM)).toBe(true);
  });

  /**
   * THE BUG THIS REPLACED.
   *
   * The old signature took an optional `teamId` and read
   * `teamId == null || teamId === user.teamId`. Every call site omitted the argument,
   * so the comparison was `undefined == null` — true — and any team lead could write to
   * any record in the agency. Nothing ever populated `users.teamId` either, so even a
   * caller that passed it would have compared against null.
   */
  it("a team lead CANNOT edit another team's records", () => {
    expect(canEdit(teamLead, "agent-9", MY_TEAM)).toBe(false);
  });

  it("an unowned record is not a wildcard", () => {
    // `ownerId == null` used to fall through the team branch and be editable by any
    // team lead. An unassigned record belongs to nobody, not to everybody.
    expect(canEdit(teamLead, null, MY_TEAM)).toBe(false);
    expect(canEdit(agent, null, MY_TEAM)).toBe(false);
  });

  it("an empty editable set grants a team lead nothing but their own", () => {
    // Fail closed: a lead with no members scopes to themselves, never to everybody.
    expect(canEdit(teamLead, "lead-1", NONE)).toBe(true);
    expect(canEdit(teamLead, "agent-1", NONE)).toBe(false);
  });
});

describe("canEditAny — setter or closer", () => {
  it("lets the setter edit", () => {
    expect(canEditAny(agent, ["agent-1", "agent-2"], ["agent-1"])).toBe(true);
  });

  it("lets the CLOSER edit an appointment somebody else set", () => {
    // The bug this replaced: a closer could edit what they could not see.
    expect(canEditAny(agent, ["agent-2", "agent-1"], ["agent-1"])).toBe(true);
  });

  it("refuses an agent who is neither", () => {
    expect(canEditAny(agent, ["agent-2", "agent-3"], ["agent-1"])).toBe(false);
  });

  it("treats an absent closer as absent, not as a wildcard", () => {
    // The dangerous failure: null == null matching and granting everyone access.
    expect(canEditAny(agent, ["agent-2", null], ["agent-1"])).toBe(false);
    expect(canEditAny(agent, [null, null], ["agent-1"])).toBe(false);
    expect(canEditAny(agent, [], ["agent-1"])).toBe(false);
  });

  it("still lets the setter edit when there is no closer", () => {
    expect(canEditAny(agent, ["agent-1", null], ["agent-1"])).toBe(true);
  });

  it("admins edit anything", () => {
    expect(canEditAny(admin, ["agent-2", "agent-3"], NONE)).toBe(true);
    expect(canEditAny(admin, [null, null], NONE)).toBe(true);
  });

  it("a team lead edits their downline's appointments, not another team's", () => {
    expect(canEditAny(teamLead, ["agent-1", null], MY_TEAM)).toBe(true);
    expect(canEditAny(teamLead, ["agent-9", null], MY_TEAM)).toBe(false);
    expect(canEditAny(teamLead, [null, null], MY_TEAM)).toBe(false);
  });

  it("agrees with single-column canEdit when there is only one owner", () => {
    for (const owner of ["agent-1", "agent-2", null]) {
      for (const who of [agent, other, teamLead, admin]) {
        expect(canEditAny(who, [owner], MY_TEAM)).toBe(canEdit(who, owner, MY_TEAM));
      }
    }
  });
});
