import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format MYR integer cents -> "RM 1,234.56" */
export function formatMYR(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(cents / 100);
}

/** Price per sqft in RM, computed (not stored) from cents + built-up area. */
export function pricePerSqft(askingPriceCents: number, builtUpSqft: number | null | undefined): string {
  if (!builtUpSqft || builtUpSqft <= 0) return "—";
  const rm = askingPriceCents / 100 / builtUpSqft;
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(rm);
}

/**
 * Malaysia is UTC+8 all year (no daylight saving), so a fixed offset is correct.
 */
const MY_OFFSET = "+08:00";

/**
 * Convert a `datetime-local` input value ("2026-08-12T09:00") to an ISO instant,
 * interpreting it as MALAYSIA time regardless of the device's own timezone.
 *
 * The bug this fixes: the follow-up form did `new Date(value).toISOString()`, which
 * parses a zone-less string in the BROWSER's timezone. Both places that display
 * follow-ups force Asia/Kuala_Lumpur, so an agent whose laptop or phone was set to
 * another zone typed 09:00 and the reminder showed — and fired — at a different
 * hour, with nothing on screen to reveal the discrepancy.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  // datetime-local gives "YYYY-MM-DDTHH:mm" (seconds optional).
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2})?$/.exec(value.trim());
  if (!m) {
    // Already carries a zone, or is something unexpected — fall back to Date parsing.
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(`${m[1]}T${m[2]}${m[3] ?? ":00"}${MY_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Inverse of localInputToIso: an ISO instant back to a `datetime-local` value
 * showing MALAYSIA time, so edit forms round-trip without shifting.
 */
export function isoToLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  const my = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return my.toISOString().slice(0, 16);
}

/* ---------- rates and price ranges (new launch / project sales) ---------- */

/**
 * Rates are stored as integer BASIS POINTS, never as floats: 250 = 2.50%.
 *
 * Same reasoning as money-as-cents. A developer commission of 2.75% held as 0.0275
 * cannot be compared or summed exactly, and commission is arithmetic someone gets
 * paid on. These two helpers are the only place the conversion happens.
 */
export function percentToBp(percent: number | string | null | undefined): number | null {
  if (percent === "" || percent == null) return null;
  const n = Number(percent);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function bpToPercent(bp: number | null | undefined): number | null {
  return bp == null ? null : bp / 100;
}

/** Basis points as a readable percentage: 250 -> "2.5%", 275 -> "2.75%", null -> "—". */
export function formatBp(bp: number | null | undefined): string {
  if (bp == null) return "—";
  const pct = bp / 100;
  // Trim trailing zeros so 2.50 reads as 2.5 and 3.00 as 3.
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

/**
 * A project's indicative price span, from the cheapest and dearest unit type.
 *
 * Both figures are MYR integer cents. A project with no unit types priced yet has no
 * range to show, and one where every type costs the same shows a single figure
 * rather than "RM 620,000 – RM 620,000".
 */
export function formatPriceRange(from: number | null, to: number | null): string {
  if (from == null) return "Price on request";
  if (to == null || to === from) return formatMYR(from);
  return `${formatMYR(from)} – ${formatMYR(to)}`;
}
