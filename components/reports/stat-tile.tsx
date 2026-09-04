import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A tile that shows a number and, where one exists, goes to the rows behind it.
 *
 * Every tile here answered a question ("how many open leads?") and then left the reader
 * to go and find the list themselves. `href` makes the number the way in, which is the
 * only thing a dashboard has over a report: you can act on what it just told you. A
 * tile with no list to point at stays an inert div rather than growing a false
 * affordance.
 */
export function StatTile({
  label, value, icon: Icon, hint, accent, tone, toneNote, spark, href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  accent?: boolean;
  /** A colour from lib/chart-colors, and only when the number MEANS good or bad. */
  tone?: string;
  /** What `tone` is saying, in words. A judgement is never carried by hue alone. */
  toneNote?: string;
  /** Recent history, oldest first. Rendered as a bare sparkline — no axes, no labels. */
  spark?: number[];
  /** The filtered list this number was counted from. */
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span className="truncate">{label}</span>
          {/* Drawn at rest, not on hover. The affordance has to be there before the
              pointer is, and on a phone there is no pointer to reveal it. */}
          {href && <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </span>
        <span
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg",
            accent ? "bg-accent/15 text-accent-foreground" : "bg-secondary text-primary",
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
      </div>
      {/* Proportional figures: tabular digits make a large standalone number look loose.
          break-words, because a formatted ringgit figure is one unbreakable token and a
          tile two-up on a phone is narrower than it. */}
      <div className="mt-2 break-words text-2xl font-semibold leading-none" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {toneNote && (
        <div className="mt-1.5 text-xs font-medium" style={tone ? { color: tone } : undefined}>
          {toneNote}
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} color={tone} />}
      {hint && <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>}
    </>
  );

  if (!href) return <div className="rounded-xl border bg-card p-4">{body}</div>;

  return (
    <Link
      href={href}
      className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {body}
    </Link>
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
