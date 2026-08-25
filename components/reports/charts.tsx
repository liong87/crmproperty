import { FUNNEL_RAMP } from "@/lib/chart-colors";

/**
 * A stat tile.
 *
 * Proportional figures, not tabular: equal-width digits make a large standalone number
 * look loose. Body sans, not the display serif — a serif hero figure reads as
 * decoration rather than data. `tnum` belongs in tables and axes, where digits align.
 */
export function StatCard({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  /** A colour from lib/chart-colors only, and only when the number means good or bad. */
  tone?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export interface BarRow { label: string; value: number; sub?: string }

/**
 * Horizontal bar list. No charting library, mobile-first.
 *
 * One series, one colour — deliberately NOT darker-where-bigger. Colouring nominal
 * categories by their value spends the identity channel re-encoding what bar length
 * already shows.
 */
export function BarList({ rows, formatValue }: { rows: BarRow[]; formatValue?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{r.label}</span>
            <span className="text-muted-foreground tnum">
              {r.sub ?? (formatValue ? formatValue(r.value) : r.value)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: FUNNEL_RAMP[1] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
