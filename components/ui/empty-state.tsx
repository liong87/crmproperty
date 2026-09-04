import type { LucideIcon } from "lucide-react";

/**
 * Two states, not one.
 *
 * "You have no leads yet" and "no leads match these filters" want opposite things
 * from the reader — the first wants a way to create one, the second a way to widen
 * the search. Rendering the same box for both is why the old copy said "Capture a new
 * lead or adjust your filters" and offered neither.
 *
 * `action` was always in the signature and no caller passed one. It is now the point
 * of the component: an empty state with nothing to press is a dead end.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        {hint && <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
