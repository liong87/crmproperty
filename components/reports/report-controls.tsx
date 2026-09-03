import Link from "next/link";
import { RANGE_KEYS, withParam, type RangeKey } from "@/lib/reports/range";
import { cn } from "@/lib/utils";

const RANGE_LABEL: Record<RangeKey, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "this-month": "This month",
  "last-month": "Last month",
  max: "Maximum",
  custom: "Custom",
};

export type ReportParams = Record<string, string | undefined>;

/**
 * The controls that drive the whole page.
 *
 * Links rather than a client component, deliberately. The page is a server component
 * that refetches on the query string, so this needs no JavaScript, survives a reload,
 * and — the part that matters for a report — can be bookmarked and pasted to a
 * colleague who then sees exactly the same numbers.
 */
export function ReportControls({
  params,
  sources,
  projects,
  basePath = "/reports",
}: {
  params: ReportParams;
  sources: { key: string; label: string }[];
  projects: { id: string; name: string }[];
  basePath?: string;
}) {
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium transition whitespace-nowrap",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
    );

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Leads created</span>
        {RANGE_KEYS.filter((k) => k !== "custom").map((k) => (
          <Link key={k} href={`${basePath}${withParam(params, "range", k)}`} className={chip((params.range ?? "30") === k)}>
            {RANGE_LABEL[k]}
          </Link>
        ))}
      </div>

      {(sources.length > 0 || projects.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {sources.length > 0 && (
            <>
              <span className="text-xs font-medium text-muted-foreground">Source</span>
              <Link href={`${basePath}${withParam(params, "source", null)}`} className={chip(!params.source)}>
                All sources
              </Link>
              {sources.map((s) => (
                <Link
                  key={s.key}
                  href={`${basePath}${withParam(params, "source", s.key)}`}
                  className={chip(params.source === s.key)}
                >
                  {s.label}
                </Link>
              ))}
            </>
          )}
          {projects.length > 0 && (
            <>
              <span className="ml-2 text-xs font-medium text-muted-foreground">Product</span>
              <Link href={`${basePath}${withParam(params, "project", null)}`} className={chip(!params.project)}>
                All products
              </Link>
              {projects.slice(0, 8).map((p) => (
                <Link
                  key={p.id}
                  href={`${basePath}${withParam(params, "project", p.id)}`}
                  className={chip(params.project === p.id)}
                >
                  {p.name}
                </Link>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Lead | Campaign, matching the competitor's split. */
export function ReportTabs({ params, basePath = "/reports" }: { params: ReportParams; basePath?: string }) {
  const tab = params.tab === "campaign" ? "campaign" : "lead";
  const item = (key: "lead" | "campaign", label: string) => (
    <Link
      key={key}
      href={`${basePath}${withParam(params, "tab", key === "lead" ? null : key)}`}
      aria-current={tab === key ? "page" : undefined}
      className={cn(
        "flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition",
        tab === key
          ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex items-center gap-1 print:hidden">
      {item("lead", "Lead")}
      {item("campaign", "Campaign")}
    </div>
  );
}

/**
 * The header that only exists on paper.
 *
 * A report shared without its parameters is misleading the moment it leaves the
 * screen: the filters are in the URL, and the URL is not on the printout. Whoever is
 * handed the page has to be able to see what window and what filters produced these
 * numbers, or they will read them as "the business" rather than "Meta leads in August".
 */
export function PrintHeader({
  title,
  rangeLabel,
  filters,
}: {
  title: string;
  rangeLabel: string;
  filters: string[];
}) {
  return (
    <div className="hidden print:mb-4 print:block print:border-b print:pb-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">Lanthorn Properties CRM</p>
      <h1 className="font-display text-lg font-bold">{title}</h1>
      <p className="mt-0.5 text-[11px] text-gray-600">
        {rangeLabel}
        {filters.length > 0 ? ` · ${filters.join(" · ")}` : " · no filters"} · generated{" "}
        {new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}
      </p>
    </div>
  );
}
