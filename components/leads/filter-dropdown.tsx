"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption { value: string; label: string; count: number }

/**
 * A multi-select filter chip.
 *
 * Options are the values that ACTUALLY OCCUR in the current result set, passed in by
 * the page — not a hardcoded enum. A filter offering "Bangsar South" when nobody in
 * your queue is looking there wastes a click every time, and worse, implies the list
 * is the whole world rather than what you happen to be holding.
 *
 * Selection lives in the query string, so a filtered view survives a refresh and can
 * be pasted to a colleague. Values combine OR within a chip and AND across chips,
 * which is the only combination anybody means.
 *
 * Portalled, for the same reason the assignee menu is: this sits in a horizontally
 * scrollable row, and an absolutely positioned menu inside one gets clipped.
 */
export function FilterDropdown({
  param, label, options,
}: {
  /** Query-string key. Repeated once per selected value. */
  param: string;
  label: string;
  options: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.getAll(param);

  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; left: number } | null>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btn.current?.getBoundingClientRect();
      if (r) setRect({ top: r.bottom + 6, left: Math.min(r.left, window.innerWidth - 248) });
    };
    place();
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle(value: string) {
    const next = new URLSearchParams(params.toString());
    const current = next.getAll(param);
    next.delete(param);
    const after = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    for (const v of after) next.append(param, v);
    // Any filter change resets paging — page 3 of a different result set is nowhere.
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  if (options.length === 0) return null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          selected.length > 0
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-input bg-card text-muted-foreground hover:border-gray-300 hover:text-foreground",
        )}
      >
        {label}
        {selected.length > 0 && <span className="tabular-nums">{selected.length}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menu}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: 240 }}
            className="z-50 max-h-72 overflow-y-auto rounded-xl border bg-card p-1 shadow-lg"
          >
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{o.count}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * A selected value, shown beside its parent chip so what is filtering is visible
 * without opening anything. Clicking it removes that one value.
 */
export function ActiveFilterChip({
  param, value, label,
}: {
  param: string; value: string; label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function remove() {
    const next = new URLSearchParams(params.toString());
    const rest = next.getAll(param).filter((v) => v !== value);
    next.delete(param);
    for (const v of rest) next.append(param, v);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={remove}
      className="flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/15"
    >
      {label}
      <X className="h-3 w-3" />
    </button>
  );
}
