import { describe, it, expect } from "vitest";
import { nextAfter, poolCounterKey } from "./pool";

const pool = (...names: string[]) => names.map((n) => ({ userId: n, name: n.toUpperCase() }));

describe("nextAfter — who a stalled lead passes to", () => {
  it("hands it to the next person in the visible order", () => {
    expect(nextAfter(pool("a", "b", "c"), "a")).toBe("b");
    expect(nextAfter(pool("a", "b", "c"), "b")).toBe("c");
  });

  it("wraps around at the end", () => {
    expect(nextAfter(pool("a", "b", "c"), "c")).toBe("a");
  });

  it("refuses to pass on when there is nobody else", () => {
    // A pool of one is the common case for a small launch. It must not be an error,
    // and it must never hand the lead back to the same person.
    expect(nextAfter(pool("a"), "a")).toBeNull();
    expect(nextAfter([], "a")).toBeNull();
  });

  it("starts at the top when the current owner has left the pool", () => {
    // Reassigned in by hand, or removed from the pool since. Giving up here would
    // strand the lead with somebody who is no longer working the project.
    expect(nextAfter(pool("a", "b"), "someone-else")).toBe("a");
    expect(nextAfter(pool("a", "b"), null)).toBe("a");
  });

  it("never returns the current owner", () => {
    for (const owner of ["a", "b", "c", "x", null]) {
      expect(nextAfter(pool("a", "b", "c"), owner)).not.toBe(owner);
    }
  });
});

describe("poolCounterKey", () => {
  it("fits the assignment_counter primary key, which is varchar(50)", () => {
    const key = poolCounterKey("11111111-2222-4333-8444-555555555555");
    expect(key.length).toBeLessThanOrEqual(50);
  });

  it("is distinct per project, so one pool's rotation never disturbs another's", () => {
    expect(poolCounterKey("a")).not.toBe(poolCounterKey("b"));
  });

  it("never collides with the pre-existing global rotation key", () => {
    expect(poolCounterKey("lead_round_robin")).not.toBe("lead_round_robin");
  });
});
