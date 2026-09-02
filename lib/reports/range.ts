/**
 * The one date range that drives every section of the report.
 *
 * Before this, each section carried its own fixed window — "last 90 days" here, "last
 * 7 days" there — and nothing could be aligned. Two numbers on the same screen
 * describing different periods is worse than one number: the reader has no way to know
 * they are not comparable, and will compare them anyway.
 *
 * The chosen range lives in the query string. A report you cannot send to someone is
 * half a feature, and that matters more here than on any other screen.
 */

export const RANGE_KEYS = ["7", "30", "this-month", "last-month", "max", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const DEFAULT_RANGE: RangeKey = "30";

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  from: Date;
  to: Date;
  /** Whole days spanned, for the existing sinceDays-shaped queries. */
  days: number;
}

export interface RangeParams {
  range?: string;
  from?: string;
  to?: string;
}

const DAY = 24 * 60 * 60 * 1000;

/** Malaysia is a fixed +08:00 with no DST, so "today" is unambiguous without a library. */
const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

function startOfDayMY(d: Date): Date {
  const shifted = new Date(d.getTime() + MY_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - MY_OFFSET_MS);
}

function startOfMonthMY(d: Date, monthsBack = 0): Date {
  const shifted = new Date(d.getTime() + MY_OFFSET_MS);
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() - monthsBack);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - MY_OFFSET_MS);
}

const isKey = (v: string | undefined): v is RangeKey =>
  typeof v === "string" && (RANGE_KEYS as readonly string[]).includes(v);

/** A date the user typed, or null. Never throws — a bad value falls back to the default. */
function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveRange(p: RangeParams, now = new Date()): ResolvedRange {
  const key: RangeKey = isKey(p.range) ? p.range : DEFAULT_RANGE;
  const endOfToday = new Date(startOfDayMY(now).getTime() + DAY - 1);

  const span = (from: Date, to: Date, label: string): ResolvedRange => ({
    key,
    label,
    from,
    to,
    days: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY)),
  });

  switch (key) {
    case "7":
      return span(startOfDayMY(new Date(now.getTime() - 6 * DAY)), endOfToday, "Last 7 days");
    case "this-month":
      return span(startOfMonthMY(now), endOfToday, "This month");
    case "last-month": {
      const from = startOfMonthMY(now, 1);
      // Ends the instant this month starts, so the two never overlap by a day.
      return span(from, new Date(startOfMonthMY(now).getTime() - 1), "Last month");
    }
    case "max":
      // Ten years. Not "all time" as an unbounded query — an open-ended scan is how a
      // report starts timing out once the table is large, and nobody here has data
      // older than the agency.
      return span(new Date(now.getTime() - 3650 * DAY), endOfToday, "Maximum");
    case "custom": {
      const from = parseDate(p.from);
      const to = parseDate(p.to);
      if (!from || !to || to < from) {
        // An incomplete custom range is not an error state. The user is mid-way through
        // choosing; showing the default beats showing nothing or a red box.
        return span(startOfDayMY(new Date(now.getTime() - 29 * DAY)), endOfToday, "Last 30 days");
      }
      return span(from, new Date(to.getTime() + DAY - 1), `${p.from} → ${p.to}`);
    }
    case "30":
    default:
      return span(startOfDayMY(new Date(now.getTime() - 29 * DAY)), endOfToday, "Last 30 days");
  }
}

/** Rebuild the query string with one key changed, preserving everything else. */
export function withParam(
  current: Record<string, string | undefined>,
  key: string,
  value: string | null,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== key) next.set(k, v);
  }
  if (value) next.set(key, value);
  const s = next.toString();
  return s ? `?${s}` : "";
}
