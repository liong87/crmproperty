"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { assignLead } from "@/server/leads/actions";
import type { AssignableUser } from "@/server/users/queries";
import { cn } from "@/lib/utils";

/**
 * Reassign a lead from the list, without leaving it.
 *
 * PORTALLED TO THE BODY, and this is the whole reason the first version looked broken:
 * `components/ui/table` wraps every table in `overflow-auto`, so an absolutely
 * positioned menu inside a row is clipped by that box — the list opened and was sliced
 * off after one line. No amount of z-index fixes it; the menu has to leave the
 * container. It is therefore rendered into document.body at fixed coordinates taken
 * from the trigger.
 *
 * The consequence of fixed coordinates is that they go stale, so the menu closes on
 * scroll and on resize rather than floating away from its row.
 */
export function AssignCell({
  leadId, currentName, currentId, users,
}: {
  leadId: string;
  currentName: string | null;
  currentId: string | null;
  users: AssignableUser[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const place = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 224);
    // Flip up when there is not room below — a menu that opens off the bottom of the
    // viewport is the same bug in a different direction.
    const below = window.innerHeight - r.bottom;
    const height = Math.min(288, 44 + users.length * 34);
    const top = below < height + 8 ? r.top - height - 4 : r.bottom + 4;
    setRect({
      top,
      left: Math.min(r.left, window.innerWidth - width - 8),
      width,
    });
  }, [users.length]);

  React.useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Capture phase: the table scrolls, not the window, and a bubbling listener on
    // window never hears it.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, place]);

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? users.filter((u) => u.name.toLowerCase().includes(q)) : users;
  }, [users, query]);

  function pick(userId: string) {
    setOpen(false);
    if (userId === currentId) return;
    setError(null);
    start(async () => {
      const res = await assignLead(leadId, userId);
      if (!res.success) return setError(res.error ?? "Could not reassign.");
      router.refresh();
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setQuery(""); setOpen((o) => !o); }}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
          currentName ? "" : "font-medium text-destructive",
        )}
      >
        {pending && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
        <span className="truncate">{currentName ?? "Unassigned"}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width }}
            className="z-50 overflow-hidden rounded-xl border bg-card shadow-lg"
          >
            {users.length > 6 && (
              <div className="flex items-center gap-2 border-b px-2.5 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find someone"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto p-1">
              {shown.length === 0 && (
                <p className="px-2 py-2 text-sm text-muted-foreground">No match.</p>
              )}
              {shown.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={u.id === currentId}
                  onClick={() => pick(u.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", u.id === currentId ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{u.name}</span>
                  <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {u.role.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
