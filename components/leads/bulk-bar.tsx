"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, Trash2, X, Loader2, ChevronDown, Check } from "lucide-react";
import { bulkAssign, bulkSetProject, revokeLeads } from "@/server/leads/bulk";
import { deleteLeads } from "@/server/leads/actions";
import type { AssignableUser } from "@/server/users/queries";
import { LiveStatus } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export interface BulkRow {
  id: string; name: string; phone: string; email: string | null;
  status: string; projectName: string | null; createdAt: Date;
}

/**
 * The bulk bar, floating over the table rather than pushed in above it.
 *
 * Sticky at the bottom of the table container so it never covers the last row, which
 * is the row you are most likely to have just selected.
 *
 * Everything destructive confirms in place and names the count. Revoke is the action
 * that did not exist before: a lead assigned to the wrong agent had no way back except
 * assigning it to somebody else, which is not the same as saying nobody owns it.
 *
 * Every button carries its own word from `sm` up. Three unlabelled glyphs in a row, one
 * of which removes N client records, is a guess dressed up as a toolbar; the icons stay
 * because they are the fast recognition, the words because the icons are not enough.
 */
export function BulkBar({
  selected, rows, assignees, projects, canDelete, onClear,
}: {
  selected: string[];
  rows: BulkRow[];
  assignees: AssignableUser[];
  projects: { id: string; name: string }[];
  canDelete: boolean;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState<"delete" | "revoke" | null>(null);
  const [menu, setMenu] = React.useState<"product" | "assign" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const closeMenu = React.useCallback(() => setMenu(null), []);

  const chosen = rows.filter((r) => selected.includes(r.id));
  /*
   * The tick in the product menu means "this is what the selection already is", and it
   * can only mean that when the selection agrees with itself. Where the chosen leads
   * sit on different products there is no current value, so no menu shows a tick —
   * better than the old permanently invisible one, which promised a state it never had.
   */
  const sharedProduct =
    chosen.length > 0 && chosen.every((r) => r.projectName === chosen[0]!.projectName)
      ? chosen[0]!.projectName ?? "No project · resale & rental"
      : undefined;

  if (selected.length === 0) return null;
  const n = selected.length;
  const noun = n === 1 ? "lead" : "leads";

  function run(key: string, fn: () => Promise<{ success: boolean; error?: string }>, done?: string) {
    setPending(key); setError(null); setNote(null);
    void (async () => {
      const res = await fn();
      setPending(null); setArmed(null); setMenu(null);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      if (done) setNote(done);
      onClear();
      router.refresh();
    })();
  }

  /**
   * Export runs entirely in the browser from rows already on screen — no endpoint, no
   * server round trip, and nothing leaves that the user could not already see.
   */
  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      ["Name", "Phone", "Email", "Status", "Product", "Added"].map(esc).join(","),
      ...chosen.map((r) =>
        [r.name, r.phone, r.email ?? "", r.status, r.projectName ?? "", r.createdAt.toISOString()]
          .map((v) => esc(String(v)))
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // A download that starts silently in a background tab looks like nothing happened.
    setNote(`Exported ${chosen.length} ${chosen.length === 1 ? "lead" : "leads"} to CSV.`);
  }

  return (
    <div className="sticky bottom-4 z-20 flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-white shadow-lg dark:bg-slate-800">
        <span className="whitespace-nowrap px-1 text-sm font-semibold tabular-nums">
          {n} {noun} selected
        </span>
        {/* The count is on screen; this is the same fact for a screen reader, which
            otherwise hears nothing as the selection grows. */}
        <LiveStatus>{`${n} ${noun} selected`}</LiveStatus>
        <span className="h-5 w-px bg-white/20" />

        <Menu
          label="Assign product"
          open={menu === "product"}
          onToggle={() => setMenu((m) => (m === "product" ? null : "product"))}
          onClose={closeMenu}
          current={sharedProduct}
          items={[
            { id: "", label: "No project · resale & rental" },
            ...projects.map((p) => ({ id: p.id, label: p.name })),
          ]}
          onPick={(id) =>
            run("product", () => bulkSetProject({ ids: selected, projectId: id || null }),
              `Product set on ${n} ${noun}.`)
          }
          busy={pending === "product"}
        />

        <Menu
          label="Assign to"
          primary
          open={menu === "assign"}
          onToggle={() => setMenu((m) => (m === "assign" ? null : "assign"))}
          onClose={closeMenu}
          items={assignees.map((u) => ({ id: u.id, label: u.name }))}
          onPick={(id) => run("assign", () => bulkAssign({ ids: selected, userId: id }),
            `Reassigned ${n} ${noun}.`)}
          busy={pending === "assign"}
        />

        {armed === "revoke" ? (
          <Confirm
            text={`Take ${n} ${noun} back?`}
            busy={pending === "revoke"}
            onYes={() => run("revoke", () => revokeLeads({ ids: selected }), `Revoked ${n} ${noun}.`)}
            onNo={() => setArmed(null)}
          />
        ) : (
          <BarButton tone="warn" onClick={() => setArmed("revoke")} label="Return to unassigned">
            <Ban aria-hidden="true" className="h-3.5 w-3.5" /> Revoke
          </BarButton>
        )}

        <BarButton onClick={exportCsv} label="Export selected to CSV">
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Export</span>
        </BarButton>

        {canDelete && (
          armed === "delete" ? (
            /* NOT "cannot be undone": `deleteLeads` sets `deletedAt`. Overstating it is
               not the cautious choice — it is what makes the person who needs the
               record back give up instead of asking. */
            <Confirm
              text={`Delete ${n} ${noun}? They disappear from every list; an administrator can restore them.`}
              busy={pending === "delete"}
              onYes={() => run("delete", () => deleteLeads(selected), `Deleted ${n} ${noun}.`)}
              onNo={() => setArmed(null)}
            />
          ) : (
            <BarButton tone="danger" onClick={() => setArmed("delete")} label={`Delete ${n} selected ${noun}`}>
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="max-sm:sr-only">Delete</span>
            </BarButton>
          )
        )}

        <BarButton onClick={onClear} label="Clear selection">
          <X aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="max-sm:sr-only">Clear</span>
        </BarButton>

        {error && <span role="alert" className="w-full px-1 text-xs text-rose-300">{error}</span>}
        {note && <span role="status" className="w-full px-1 text-xs text-emerald-300">{note}</span>}
      </div>
    </div>
  );
}

function BarButton({
  children, onClick, tone, label,
}: {
  children: React.ReactNode; onClick: () => void;
  tone?: "danger" | "warn" | "primary";
  /** The full name, for the tooltip and for the narrow width where the word is sr-only. */
  label: string;
}) {
  return (
    <button
      type="button" onClick={onClick} title={label} aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors",
        tone === "danger" ? "bg-rose-500/20 text-rose-200 hover:bg-rose-500/30"
          : tone === "warn" ? "bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
          : tone === "primary" ? "bg-primary text-primary-foreground hover:brightness-110"
          : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Confirm({
  text, busy, onYes, onNo,
}: {
  text: string; busy: boolean; onYes: () => void; onNo: () => void;
}) {
  const yes = React.useRef<HTMLButtonElement>(null);
  /* Arming replaces the button that had focus, so focus falls to <body> unless it is
     moved here — and the question is never read out otherwise. */
  React.useEffect(() => { yes.current?.focus(); }, []);
  return (
    <span
      role="alertdialog"
      aria-label={text}
      className="flex flex-wrap items-center gap-1 text-xs"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onNo(); } }}
    >
      <span className="text-white/80">{text}</span>
      <button ref={yes} type="button" onClick={onYes} disabled={busy}
        className="rounded-lg bg-rose-500 px-2 py-1 font-semibold text-white disabled:opacity-60">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
      </button>
      <button type="button" onClick={onNo}
        className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10">No</button>
    </span>
  );
}

function Menu({
  label, items, onPick, open, onToggle, onClose, busy, primary, current,
}: {
  label: string;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  open: boolean; onToggle: () => void; onClose: () => void; busy: boolean; primary?: boolean;
  /** The value every selected lead already holds, when they agree. Omit when they do not. */
  current?: string;
}) {
  const wrap = React.useRef<HTMLSpanElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);

  /* The same contract as the assignee menu in assign-cell: a click outside closes it,
     Escape closes it and hands focus back to the trigger rather than to <body>. */
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (items.length === 0) return null;
  return (
    <span ref={wrap} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold transition-colors",
          primary
            ? "bg-primary text-primary-foreground hover:brightness-110"
            : "text-white/80 hover:bg-white/10 hover:text-white",
        )}
      >
        {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
        <ChevronDown aria-hidden="true" className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        /* Opens UPWARD: the bar sits at the bottom of the viewport, so a menu dropping
           down would open off-screen. */
        <div
          role="listbox"
          aria-label={label}
          className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border bg-card p-1 text-foreground shadow-lg"
        >
          {items.map((it) => {
            const on = current !== undefined && it.label === current;
            return (
              <button
                key={it.id || "none"} type="button" role="option" aria-selected={on}
                onClick={() => onPick(it.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
              >
                {current !== undefined && (
                  <Check aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", on ? "opacity-100" : "opacity-0")} />
                )}
                <span className="truncate">{it.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
