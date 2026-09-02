import { cn } from "@/lib/utils";

/**
 * Every page opens the same way: a 4px vertical gradient bar, the title, and one
 * sentence with a single number in it.
 *
 * The bar costs one div and brands every screen — the cheapest thing in the design
 * system. The subtitle rule matters more than it looks: one big number plus a
 * plain-English clause ("2 leads to work on"), never a grid of stat tiles at the top
 * of a page. A stat grid makes the reader choose what to care about; this decides for
 * them.
 */
export function PageTitle({
  title, count, children, actions, className,
}: {
  title: string;
  /** The one number. Rendered in brand colour inside the subtitle. */
  count?: number | string;
  /** The rest of the subtitle sentence, after the number. */
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex items-stretch gap-3">
        <div
          aria-hidden="true"
          className="w-1 shrink-0 self-stretch rounded-full bg-gradient-to-b from-primary to-accent"
        />
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
          {children && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {count !== undefined && (
                <span className="font-semibold tabular-nums text-primary">{count}</span>
              )}
              {children}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
