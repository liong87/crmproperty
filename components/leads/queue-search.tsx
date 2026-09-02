"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

/**
 * Search that filters as you type.
 *
 * It was a plain <form> with no button, so typing did nothing until you happened to
 * press Enter — which looks exactly like a broken search, and was reported as one. The
 * Leads page at least shows a Search button beside its box; this had neither.
 *
 * Debounced at 350ms rather than firing per keystroke: every navigation re-renders the
 * page on the server, and this app has already hit the Worker's CPU ceiling once.
 *
 * `replace`, not `push`, so twelve keystrokes do not become twelve entries in the back
 * button. `scroll: false` so the list does not jump under the cursor while typing.
 */
export function QueueSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";

  const [value, setValue] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const first = React.useRef(true);

  // Follow the URL when it changes from outside — a cleared filter, a pasted link.
  React.useEffect(() => setValue(initial), [initial]);

  React.useEffect(() => {
    // Do not navigate on mount; the server already rendered this query.
    if (first.current) { first.current = false; return; }
    if (value === initial) return;

    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page");
      start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, 350);
    return () => clearTimeout(t);
    // `params` is intentionally read fresh inside the timeout rather than depended on,
    // so a filter chip change mid-typing does not cancel the pending search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initial, pathname, router]);

  return (
    <div className="relative min-w-[15rem] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setValue("")}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      {pending ? (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
