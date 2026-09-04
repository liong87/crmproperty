import Link from "next/link";
import { cn } from "@/lib/utils";

export interface FunnelStageDatum {
  label: string;
  value: number;
  /** The cohort this stage counted, where one can be listed. Makes the name a link. */
  href?: string;
}

/**
 * How many stages the colour ramp is defined for in globals.css (--stage-1..5).
 * The ramp is spread across however many stages are actually passed, so a four-stage
 * funnel still ENDS on the darkest green rather than stopping short of it.
 */
const RAMP_STEPS = 5;

export const rampIndex = (i: number, n: number): number =>
  n <= 1 ? RAMP_STEPS : Math.round(1 + (i * (RAMP_STEPS - 1)) / (n - 1));

/**
 * The funnel outline.
 *
 * Geometry taken from the teardown and not redesigned: each stage is a flat plateau,
 * and the transition between two plateaus is a cubic whose BOTH control points sit on
 * the boundary x. That is what produces the S-curve shoulder rather than a straight
 * diagonal.
 *
 * `pad` inflates the whole shape so the same function can draw the soft ghost behind
 * the solid band. The 0.2 floor on the half-height is load-bearing: without it a stage
 * with no leads collapses to zero height and the band appears to be cut in half, which
 * reads as a rendering fault rather than as "nothing has reached this stage yet".
 */
export function buildPath(values: number[], max: number, pad: number): string {
  const n = values.length;
  const w = 100 / n;
  const half = (v: number) => Math.max(0.2, (32 + pad) * (max ? v / max : 0)) + pad * 0.25;
  const cx = (i: number) => w * (i + 0.5);
  const top = (i: number) => 50 - half(values[i] ?? 0);
  const bot = (i: number) => 50 + half(values[i] ?? 0);

  let d = `M 0 ${top(0)} L ${cx(0)} ${top(0)}`;
  for (let i = 0; i < n - 1; i++) {
    const bx = w * (i + 1);
    d += ` C ${bx} ${top(i)}, ${bx} ${top(i + 1)}, ${cx(i + 1)} ${top(i + 1)}`;
  }
  d += ` L 100 ${top(n - 1)} L 100 ${bot(n - 1)}`;

  for (let j = n - 1; j > 0; j--) {
    const bx = w * j;
    d += ` C ${bx} ${bot(j)}, ${bx} ${bot(j - 1)}, ${cx(j - 1)} ${bot(j - 1)}`;
  }
  return `${d} L 0 ${bot(0)} Z`;
}

export const pct = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/**
 * The funnel as one continuous tapering band rather than five separate tiles.
 *
 * The point of the shape is that drop-off is legible as a shape — you see where the
 * band narrows before you read a single number. Tiles cannot do that, because each one
 * is an island and the reader has to do the division themselves.
 *
 * Three numbers per stage, and the third is the one that matters: conversion from the
 * PREVIOUS stage. "Half of those who showed up booked" is actionable; "3% of all leads
 * booked" only ever reads as bad.
 *
 * A Server Component — no state, no effects. It renders from numbers alone.
 */
export function FunnelBand({
  stages,
  className,
}: {
  /** Prop, not hardcoded, so Report can reuse this with a different stage list. */
  stages: FunnelStageDatum[];
  className?: string;
}) {
  if (stages.length === 0) return null;

  const values = stages.map((s) => s.value);
  const max = values[0] ?? 0;
  const n = stages.length;
  const w = 100 / n;

  /*
   * Two stops per stage at the same boundary offset, so colours butt against each
   * other instead of blending. A blended ramp would imply the stages are a continuum;
   * they are five discrete things.
   */
  const stops = stages.flatMap((_, i) => {
    const c = `var(--stage-${rampIndex(i, n)})`;
    return [
      <stop key={`a${i}`} offset={`${i * w}%`} stopColor={c} />,
      <stop key={`b${i}`} offset={`${(i + 1) * w}%`} stopColor={c} />,
    ];
  });

  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const ink = (i: number) => ({ color: `var(--stage-${rampIndex(i, n)}-ink)` });

  return (
    /*
     * The band scrolls inside its own named region rather than widening the page.
     * Five stage names cannot compress below their own min-content, so on a 390px
     * phone the grid pushed the whole document sideways; giving the band a floor and
     * letting it scroll here keeps the taper readable and the page body honest. The
     * region is focusable because a scroll container with no tab stop is unreachable
     * without a pointer.
     */
    <div
      role="region"
      aria-label="Funnel by stage"
      tabIndex={0}
      className={cn(
        "overflow-x-auto px-5 pb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
    >
      <div className="min-w-[22rem]">
      <div className="grid" style={cols}>
        {stages.map((s, i) => (
          <div
            key={s.label}
            className="border-l border-line-soft px-1.5 pb-2.5 pt-3.5 text-center text-[10.5px] font-semibold uppercase tracking-[0.11em] first:border-l-0"
            style={ink(i)}
          >
            {/* A stage is a cohort, so where the list exists the name opens it. Without
                this the reader could see the drop-off and had nowhere to go with it. */}
            {s.href ? (
              <Link
                href={s.href}
                className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {s.label}
                <span className="sr-only"> — {s.value} of {max}</span>
              </Link>
            ) : (
              s.label
            )}
          </div>
        ))}
      </div>

      <div className="relative h-[168px] max-[620px]:h-[132px]">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="absolute inset-0 block h-full w-full"
        >
          <defs>
            <linearGradient id="funnel-band-fill" x1="0" y1="0" x2="1" y2="0">
              {stops}
            </linearGradient>
          </defs>
          {/* Padded ghost behind the solid band, so the taper has a soft halo. */}
          <path d={buildPath(values, max, 8)} fill="url(#funnel-band-fill)" opacity={0.22} />
          <path d={buildPath(values, max, 0)} fill="url(#funnel-band-fill)" />
        </svg>

        <div className="absolute inset-0 grid" style={cols}>
          {stages.map((s, i) => (
            <div
              key={s.label}
              className="flex items-center justify-center border-l border-line-soft first:border-l-0"
            >
              <span
                className="font-display text-3xl font-bold tabular-nums tracking-[-0.02em] max-[620px]:text-xl"
                style={ink(i)}
              >
                {pct(s.value, max)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid" style={cols}>
        {stages.map((s, i) => {
          const prev = i === 0 ? null : (values[i - 1] ?? 0);
          return (
            <div
              key={s.label}
              className="border-l border-line-soft px-1.5 pb-1 pt-3 text-center first:border-l-0"
            >
              <div className="text-xs tabular-nums text-muted-foreground">
                {s.value} of {max}
              </div>
              {prev == null ? (
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">starting point</div>
              ) : (
                <div className="mt-0.5 text-[11.5px] font-semibold tabular-nums" style={ink(i)}>
                  <span className="font-normal opacity-55">&rarr;</span> {pct(s.value, prev)}%
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
