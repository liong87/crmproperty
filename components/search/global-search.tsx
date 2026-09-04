"use client";
/**
 * Global search — the one control that answers "where is this person?".
 *
 * Opens on ⌘K / Ctrl-K from anywhere, or by clicking the field in the sidebar (and
 * the icon in the mobile header). Arrow keys move, Enter opens, Escape closes, and
 * focus returns to whatever opened it. Results are grouped by record type because the
 * type IS the answer half the time — a name that comes back under Contacts has
 * already been qualified.
 *
 * `aria-activedescendant` rather than roving focus: the input keeps focus so typing
 * never breaks, which is what a search-as-you-type combobox is required to do.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, UserPlus, Contact as ContactIcon, Building2, Landmark } from "lucide-react";
import { searchEverything } from "@/server/search/actions";
import type { SearchHit, SearchKind } from "@/server/search/global";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<SearchKind, string> = {
  lead: "Leads",
  contact: "Contacts",
  property: "Properties",
  project: "Projects",
};
const KIND_ICON = {
  lead: UserPlus,
  contact: ContactIcon,
  property: Building2,
  project: Landmark,
} as const;
const ORDER: SearchKind[] = ["lead", "contact", "property", "project"];

export function GlobalSearch({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);
  const listId = React.useId();

  // ⌘K / Ctrl-K from anywhere. Ignored while the user is typing in another field,
  // because a shortcut that steals focus mid-sentence is worse than no shortcut.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        restoreTo.current = document.activeElement as HTMLElement | null;
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 250ms debounce: fast enough to feel live, slow enough not to fire a query per
  // keystroke on a phone connection.
  React.useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchEverything(term)
        .then((r) => {
          if (cancelled) return;
          setHits(r);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQ("");
    setHits([]);
    restoreTo.current?.focus?.();
  }, []);

  const go = React.useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      close();
      router.push(hit.href);
    },
    [close, router],
  );

  const grouped = ORDER.map((kind) => ({ kind, rows: hits.filter((h) => h.kind === kind) })).filter(
    (g) => g.rows.length > 0,
  );
  const flat = grouped.flatMap((g) => g.rows);

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        onClick={() => {
          restoreTo.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }}
        className="flex h-9 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-left text-sm text-muted-foreground transition hover:border-ring/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Search everything</span>
        <kbd className="hidden shrink-0 rounded border border-input px-1.5 py-0.5 font-sans text-[10px] font-semibold text-muted-foreground lg:block">
          ⌘K
        </kbd>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => {
          restoreTo.current = document.activeElement as HTMLElement | null;
          setOpen(true);
        }}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        <span className="sr-only">Search everything</span>
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search everything"
            className="w-full max-w-xl overflow-hidden rounded-2xl border bg-card shadow-lg"
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                role="combobox"
                aria-expanded={flat.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={flat[active] ? `${listId}-${flat[active]!.kind}-${flat[active]!.id}` : undefined}
                aria-label="Search leads, contacts, properties and projects"
                placeholder="Search a name, phone number, listing or project…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    close();
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((i) => Math.min(i + 1, flat.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    go(flat[active]);
                  }
                }}
              />
              {loading && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
            </div>

            <div id={listId} role="listbox" aria-label="Search results" className="max-h-[55vh] overflow-y-auto p-1.5">
              {q.trim().length < 2 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Type at least two characters. Phone numbers match with or without spaces and dashes.
                </p>
              )}
              {q.trim().length >= 2 && !loading && flat.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing matches “{q.trim()}” in the records you can see.
                </p>
              )}
              {grouped.map((group) => {
                const Icon = KIND_ICON[group.kind];
                return (
                  <div key={group.kind} className="mb-1">
                    <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {KIND_LABEL[group.kind]}
                    </p>
                    {group.rows.map((hit) => {
                      const idx = flat.indexOf(hit);
                      const selected = idx === active;
                      return (
                        <button
                          key={`${hit.kind}-${hit.id}`}
                          id={`${listId}-${hit.kind}-${hit.id}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(hit)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                            selected ? "bg-secondary" : "hover:bg-secondary/60",
                          )}
                        >
                          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{hit.title}</span>
                            {hit.subtitle && (
                              <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              <kbd className="font-sans font-semibold">↑↓</kbd> to move ·{" "}
              <kbd className="font-sans font-semibold">Enter</kbd> to open ·{" "}
              <kbd className="font-sans font-semibold">Esc</kbd> to close
            </p>
          </div>
        </div>
      )}
    </>
  );
}
