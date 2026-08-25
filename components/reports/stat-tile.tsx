import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatTile({
  label, value, icon: Icon, hint, accent, tone, spark,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  accent?: boolean;
  /** A colour from lib/chart-colors, and only when the number MEANS good or bad. */
  tone?: string;
  /** Recent history, oldest first. Rendered as a bare sparkline — no axes, no labels. */
  spark?: number[];
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg",
            accent ? "bg-accent/15 text-accent-foreground" : "bg-secondary text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      {/* Proportional figures: tabular digits make a large standalone number look loose. */}
      <div className="mt-2 text-2xl font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {spark && spark.length > 1 && <Sparkline values={spark} color={tone} />}
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * A sparkline: shape only, deliberately unlabelled.
 *
 * It answers "which way is this going" and nothing else — the figure above it carries
 * the value, and the reports page carries the readable version. A number on every point
 * here would be chaos in a 200px tile.
 */
function Sparkline({ values, color }: { values: number[]; color?: string }) {
  const w = 100;
  const h = 20;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (v / max) * (h - 2) - 1).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-5 w-full" aria-hidden="true" preserveAspectRatio="none">
      <path
        d={d}
        fill="none"
        stroke={color ?? "currentColor"}
        className={color ? undefined : "text-primary"}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
