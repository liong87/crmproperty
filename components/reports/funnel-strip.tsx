import { FUNNEL_RAMP } from "@/lib/chart-colors";
import type { FunnelStage } from "@/server/reports/funnel";

/**
 * The funnel as one horizontal strip: every stage in order, each with its count and how
 * much of the previous stage survived to it.
 *
 * The stages are ordered, so they take the single-hue ramp rather than categorical
 * colours, darkening toward the goal. The percentage under each stage is drop-off from
 * the STAGE BEFORE, not from the top — "half the people who showed up booked" is a
 * number an agent can act on; "3% of all leads booked" only ever reads as bad. Under
 * the last stage that percentage is the survival rate through the bank, which is the
 * number this whole strip exists to show.
 *
 * The column count is looked up rather than interpolated: Tailwind only ships classes
 * it can see written out, so `sm:grid-cols-${n}` would compile to nothing and silently
 * collapse the strip into one column.
 */
const COLUMNS: Record<number, string> = {
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
};
export function FunnelStrip({ stages, periodLabel }: { stages: FunnelStage[]; periodLabel: string }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Your funnel</h2>
        <span className="text-xs text-muted-foreground">{periodLabel}</span>
      </div>
      <div
        className={`grid grid-cols-2 divide-y sm:divide-y-0 sm:divide-x ${COLUMNS[stages.length] ?? "sm:grid-cols-4"}`}
      >
        {stages.map((s, i) => {
          const colour = FUNNEL_RAMP[i] ?? FUNNEL_RAMP[FUNNEL_RAMP.length - 1] ?? "#124746";
          const pct = s.conversionFromPrevious;
          const prev = stages[i - 1];
          return (
            <div key={s.key} className="relative px-4 py-4">
              {/* A 3px rule rather than a filled tile: the colour has to carry the
                  sequence without competing with the number for attention. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-4 top-0 h-[3px] rounded-b"
                style={{ backgroundColor: colour }}
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {s.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold leading-none">{s.count}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {pct == null || prev == null
                  ? "starting point"
                  : `${Math.round(pct * 100)}% of ${prev.label.toLowerCase()}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
