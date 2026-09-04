import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FUNNEL_RAMP } from "@/lib/chart-colors";

/**
 * A stat tile.
 *
 * Proportional figures, not tabular: equal-width digits make a large standalone number
 * look loose. Body sans, not the display serif — a serif hero figure reads as
 * decoration rather than data. `tnum` belongs in tables and axes, where digits align.
 *
 * `href` goes to the rows the number was counted from. A figure on a report that cannot
 * be opened is a figure nobody can check, and checking is most of what a report is for.
 */
export function StatCard({
  label, value, hint, tone, toneNote, href,
}: {
  label: string;
  value: string;
  hint?: string;
  /** A colour from lib/chart-colors only, and only when the number means good or bad. */
  tone?: string;
  /** What `tone` is saying, in words. A judgement is never carried by hue alone. */
  toneNote?: string;
  /** The filtered list behind this number. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        {/* At rest, not on hover: there is no pointer on a phone to reveal it. */}
        {href && <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />}
      </div>
      {/* break-words, because a formatted ringgit figure is one unbreakable token: at
          two tiles per row on a phone "RM 12,345,678.00" is 245px in a 126px cell, and
          it was widening the whole report rather than wrapping. */}
      <div className="mt-1 break-words text-2xl font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {toneNote && (
        <div className="mt-1.5 text-xs font-medium" style={tone ? { color: tone } : undefined}>
          {toneNote}
        </div>
      )}
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  if (!href) return <div className="rounded-lg border bg-card p-4">{body}</div>;

  return (
    <Link
      href={href}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {body}
    </Link>
  );
}

export interface BarRow { label: string; value: number; sub?: string }

/**
 * Horizontal bar list. No charting library, mobile-first.
 *
 * One series, one colour — deliberately NOT darker-where-bigger. Colouring nominal
 * categories by their value spends the identity channel re-encoding what bar length
 * already shows.
 *
 * `label` names the whole figure. Without it a screen reader met four unlabelled bar
 * groups on /reports and had to guess from the card heading above, which is not
 * attached to anything. The rows stay real text — the bars alone are decoration, so
 * only they are hidden.
 */
export function BarList({
  rows, formatValue, label,
}: {
  rows: BarRow[];
  formatValue?: (n: number) => string;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <ul className="space-y-2.5" aria-label={label}>
      {rows.map((r) => (
        <li key={r.label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{r.label}</span>
            <span className="text-muted-foreground tnum">
              {r.sub ?? (formatValue ? formatValue(r.value) : r.value)}
            </span>
          </div>
          <div aria-hidden="true" className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: FUNNEL_RAMP[1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
