import Link from "next/link";

/**
 * Period selector for the funnel section.
 *
 * Deliberately links, not a client component: the page is a server component that
 * refetches on the query string, so this needs no JavaScript and survives a reload,
 * a bookmark and a link pasted to a colleague.
 */
export const RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
  { days: 3650, label: "All time" },
] as const;

export const DEFAULT_RANGE_DAYS = 90;

/** Only a value we offer is honoured — anything else falls back to the default. */
export function parseRangeDays(raw: string | undefined): number {
  const n = Number(raw);
  return RANGES.some((r) => r.days === n) ? n : DEFAULT_RANGE_DAYS;
}

/** How the chosen window reads in a heading. */
export function rangeLabel(days: number): string {
  return RANGES.find((r) => r.days === days)?.label ?? `${days} days`;
}

export function RangeFilter({ days, basePath = "/reports" }: { days: number; basePath?: string }) {
  return (
    /*
     * The max-width is what lets this wrap. PageTitle puts its actions in a shrink-0
     * flex item, so without a definite cap this row keeps its 421px max-content width
     * and pushes the whole dashboard sideways on a phone. Capped to the page gutter, it
     * wraps onto a second line instead.
     */
    <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1">
      {RANGES.map((r) => {
        const active = r.days === days;
        return (
          <Link
            key={r.days}
            href={`${basePath}?days=${r.days}`}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-md px-2.5 py-1 text-sm transition-colors " +
              (active
                ? "bg-secondary font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}
