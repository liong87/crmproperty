import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export interface BarRow { label: string; value: number; sub?: string }

/** Horizontal bar list — no charting library, mobile-first. */
export function BarList({ rows, formatValue }: { rows: BarRow[]; formatValue?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{r.label}</span>
            <span className="text-muted-foreground">{r.sub ?? (formatValue ? formatValue(r.value) : r.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-primary")} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
