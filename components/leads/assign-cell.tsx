"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { assignLead } from "@/server/leads/actions";
import type { AssignableUser } from "@/server/users/queries";
import { cn } from "@/lib/utils";

/**
 * Reassign a lead from the list, without leaving it.
 *
 * Previously this meant opening the lead, scrolling to the owner field, changing it,
 * saving, and going back — five steps to do a thing a team lead does twenty times on a
 * Monday. It is now two clicks in the row.
 *
 * The audit note is unchanged: assignLead still records who moved what, from whom, to
 * whom. Making the action quicker must not make it quieter.
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
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Both, because a popover that traps the page
  // is worse than the page it replaced.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(userId: string) {
    if (userId === currentId) return setOpen(false);
    setError(null);
    start(async () => {
      const res = await assignLead(leadId, userId);
      if (!res.success) return setError(res.error ?? "Could not reassign.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-secondary",
          currentName ? "" : "text-destructive",
        )}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : null}
        <span className="truncate">{currentName ?? "Unassigned"}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg"
        >
          {users.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No active users.</p>
          )}
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={u.id === currentId}
              onClick={() => pick(u.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
            >
              <Check className={cn("h-3.5 w-3.5 shrink-0", u.id === currentId ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{u.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{u.role}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
