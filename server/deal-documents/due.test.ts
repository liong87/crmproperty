import { describe, it, expect } from "vitest";

/**
 * The deadline arithmetic, extracted so it can be tested without a database.
 * Kept identical to the implementation in queries.ts.
 */
const MY_OFFSET_MS = 8 * 60 * 60 * 1000;
const myDayNumber = (d: Date) => Math.floor((d.getTime() + MY_OFFSET_MS) / 86_400_000);
const daysUntil = (due: Date, now: Date) => myDayNumber(due) - myDayNumber(now);

/** 3pm Malaysia time on a given day, as a UTC instant. */
const myAfternoon = (iso: string) => new Date(`${iso}T15:00:00+08:00`);
const myMorning = (iso: string) => new Date(`${iso}T09:00:00+08:00`);

describe("daysUntil — deadlines are calendar days, not elapsed time", () => {
  it("counts today as zero whatever the time of day", () => {
    expect(daysUntil(myMorning("2026-08-26"), myAfternoon("2026-08-26"))).toBe(0);
    expect(daysUntil(myAfternoon("2026-08-26"), myMorning("2026-08-26"))).toBe(0);
  });

  it("counts tomorrow as one, even if it is only an hour away", () => {
    // 11pm today to 1am tomorrow is two hours, and it is still 'tomorrow'.
    const now = new Date("2026-08-26T23:00:00+08:00");
    const due = new Date("2026-08-27T01:00:00+08:00");
    expect(daysUntil(due, now)).toBe(1);
  });

  it("does not round a 3-day deadline down to 2", () => {
    // The bug this replaced: floor() over elapsed ms turned +3 days into 2.
    expect(daysUntil(myMorning("2026-08-29"), myAfternoon("2026-08-26"))).toBe(3);
  });

  it("does not report 9 days overdue as 10", () => {
    expect(daysUntil(myMorning("2026-08-17"), myAfternoon("2026-08-26"))).toBe(-9);
  });

  it("is symmetric either side of today", () => {
    const now = myAfternoon("2026-08-26");
    for (const n of [1, 3, 7, 30, 90]) {
      const ahead = new Date(now.getTime() + n * 86_400_000);
      const behind = new Date(now.getTime() - n * 86_400_000);
      expect(daysUntil(ahead, now)).toBe(n);
      expect(daysUntil(behind, now)).toBe(-n);
    }
  });

  it("crosses a month boundary correctly", () => {
    expect(daysUntil(myMorning("2026-09-01"), myAfternoon("2026-08-31"))).toBe(1);
    expect(daysUntil(myMorning("2026-08-31"), myAfternoon("2026-09-01"))).toBe(-1);
  });

  it("uses Malaysia days, not UTC days", () => {
    // 07:00 Monday in KL is 23:00 Sunday UTC. Counting in UTC would put these on
    // different days and report 1 instead of 0.
    const now = new Date("2026-08-24T07:00:00+08:00");
    const due = new Date("2026-08-24T22:00:00+08:00");
    expect(daysUntil(due, now)).toBe(0);
  });
});
