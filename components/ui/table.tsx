import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The table primitive.
 *
 * Three things it now does that it did not before, all of them keyboard/AT
 * requirements rather than taste:
 *
 *  1. The overflow container is focusable (`tabIndex={0}` + `role="region"` + an
 *     accessible name). A 13-column table WILL scroll sideways on a laptop, and
 *     without this a keyboard user with no pointer cannot reach the columns that are
 *     off-screen — WCAG 2.1.1. `label` is therefore required, not optional.
 *  2. `TH` defaults to `scope="col"`. Without a scope every header in the app is
 *     ambiguous to a screen reader reading a cell.
 *  3. `THead sticky` pins the header row, so column names survive a long list. Leads
 *     is the table people scroll furthest and the one whose headers matter most.
 *
 * A visible caption is optional; with none, `label` becomes a screen-reader-only
 * caption so the table still has a name. The primitive was already `caption-bottom`
 * — it was designed for a caption that nobody ever passed.
 */
export function Table({
  className,
  label,
  caption,
  containerClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  /** What this table lists, e.g. "Leads". Names both the scroll region and the table. */
  label: string;
  /** A visible caption. Omit and `label` becomes an sr-only one. */
  caption?: React.ReactNode;
  containerClassName?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        "relative w-full overflow-auto rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        containerClassName,
      )}
    >
      <table className={cn("w-full caption-bottom text-sm", className)} {...props}>
        <caption className={caption ? "px-3 py-2 text-left text-xs text-muted-foreground" : "sr-only"}>
          {caption ?? label}
        </caption>
        {children}
      </table>
    </div>
  );
}

export const THead = ({
  className,
  sticky,
  ...p
}: React.HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) => (
  <thead
    className={cn(
      "[&_tr]:border-b",
      // The header needs its own opaque background or rows scroll through it.
      sticky && "sticky top-0 z-20 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]",
      className,
    )}
    {...p}
  />
);

export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="[&_tr:last-child]:border-0" {...p} />
);

// className is merged rather than spread over: TH and TD already do this, and a
// caller passing one here would otherwise silently drop the row borders.
export const TR = ({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b transition-colors hover:bg-muted/50", className)} {...p} />
);

export const TH = ({ className, scope = "col", ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope={scope}
    className={cn(
      "h-9 px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
      className,
    )}
    {...p}
  />
);

/**
 * Density: `py-2.5` on a phone (where the row is also the tap target) and `py-2` from
 * `sm` up. A uniform `p-3` cost about 20% of the rows visible on a laptop for no
 * legibility gain — in a CRM the number of records you can see at once IS the feature.
 */
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-3 py-2.5 align-middle sm:py-2", className)} {...p} />
);
