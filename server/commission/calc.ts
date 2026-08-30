/**
 * The commission arithmetic. Pure — no database, no dates, no I/O — so it can be
 * tested exhaustively, which for money is the whole point.
 *
 * Two rules govern everything here:
 *
 *   1. Money is integer cents and rates are integer basis points. No floats touch a
 *      figure anybody is paid.
 *   2. Allocations MUST sum exactly to the amount being allocated. Rounding each share
 *      independently does not do that — three equal shares of 100 cents round to 33
 *      each and lose a cent, and a commission statement that is a cent short is a
 *      conversation nobody wants. `allocate` uses largest-remainder, so the total is
 *      always exact and the odd cent goes to the largest fractional part.
 */

export const BP_TOTAL = 10_000;

/** MYR cents. */
export type Cents = number;
/** Basis points; 250 = 2.50%. */
export type Bp = number;

/**
 * Split `total` across `weights` so the parts sum to exactly `total`.
 *
 * Largest remainder: give everyone their floor, then hand the leftover cents out one
 * at a time to whoever was rounded down hardest. Ties break towards the earlier
 * weight, so the result is deterministic and a re-run produces identical figures.
 */
export function allocate(total: Cents, weights: readonly Bp[]): Cents[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (total * w) / weightSum);
  const floors = exact.map(Math.floor);
  let remaining = total - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (let k = 0; remaining > 0 && k < order.length; k++, remaining--) {
    out[order[k]!.i]! += 1;
  }
  return out;
}

/** Gross commission on a sale. Rounds to the nearest cent, half away from zero. */
export function grossCommission(baseAmount: Cents, developerBp: Bp): Cents {
  if (baseAmount <= 0 || developerBp <= 0) return 0;
  return Math.round((baseAmount * developerBp) / BP_TOTAL);
}

export interface SplitInput {
  party: "agency" | "setter" | "closer" | "co-broke";
  label: string;
  userId?: string | null;
  shareBp: Bp;
}

export interface SplitResult extends SplitInput {
  amount: Cents;
}

/**
 * Divide the gross between the parties.
 *
 * A party with a zero share is dropped rather than shown at RM 0.00 — an empty row on
 * a commission statement reads as an error, and a co-broke of nobody is the common case.
 *
 * When there is no separate closer the setter closed it themselves, so the caller
 * should merge those two shares before calling; this function does not guess.
 */
export function splitCommission(gross: Cents, parties: readonly SplitInput[]): SplitResult[] {
  const live = parties.filter((p) => p.shareBp > 0);
  const amounts = allocate(gross, live.map((p) => p.shareBp));
  return live.map((p, i) => ({ ...p, amount: amounts[i]! }));
}

export interface StageInput {
  label: string;
  releaseBp: Bp;
  dueDays?: number | null;
  sortOrder: number;
}

export interface StageResult extends StageInput {
  amount: Cents;
}

/** Spread the gross across the release stages, summing to exactly the gross. */
export function releaseStages(gross: Cents, stages: readonly StageInput[]): StageResult[] {
  const amounts = allocate(gross, stages.map((s) => s.releaseBp));
  return stages.map((s, i) => ({ ...s, amount: amounts[i]! }));
}

/**
 * A scheme is only valid if its release stages account for the whole commission.
 * Returns null when fine, or a message fit to show the person editing it.
 *
 * This is checked in the application rather than by a constraint because a table
 * constraint cannot see a row's siblings.
 */
export function validateStages(stages: readonly { releaseBp: Bp }[]): string | null {
  if (stages.length === 0) return "Add at least one release stage.";
  const total = stages.reduce((a, s) => a + s.releaseBp, 0);
  if (total !== BP_TOTAL) {
    return `Release stages must add up to 100%. They currently total ${(total / 100).toFixed(2)}%.`;
  }
  return null;
}

/** Same rule for the split. */
export function validateSplit(parts: {
  agencyBp: Bp; setterBp: Bp; closerBp: Bp; coBrokeBp: Bp;
}): string | null {
  const total = parts.agencyBp + parts.setterBp + parts.closerBp + parts.coBrokeBp;
  if (total !== BP_TOTAL) {
    return `The split must add up to 100%. It currently totals ${(total / 100).toFixed(2)}%.`;
  }
  return null;
}

/** Percent (2.5) to basis points (250), for form input. Rejects nonsense. */
export function pctToBp(pct: number): Bp | null {
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return Math.round(pct * 100);
}

export const bpToPct = (bp: Bp): number => bp / 100;
