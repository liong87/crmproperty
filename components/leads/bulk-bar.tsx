"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, Trash2, X, Loader2, ChevronDown, Check } from "lucide-react";
import { bulkAssign, bulkSetProject, revokeLeads } from "@/server/leads/bulk";
import { deleteLeads } from "@/server/leads/actions";
import type { AssignableUser } from "@/server/users/queries";
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
    const chosen = rows.filter((r) => selected.includes(r.id));
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
  }

  return (
    <div className="sticky bottom-4 z-20 flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-white shadow-lg dark:bg-slate-800">
        <span className="whitespace-nowrap px-1 text-sm font-semibold tabular-nums">
          {n} {noun} selected
        </span>
        <span className="h-5 w-px bg-white/20" />

        <Menu
          label="Assign product"
          open={menu === "product"}
          onToggle={() => setMenu((m) => (m === "product" ? null : "product"))}
          items={[
            { id: "", label: "No project · resale & rental" },
            ...projects.map((p) => ({ id: p.id, label: p.name })),
          ]}
          onPick={(id) =>
            run("product", () => bulkSetProject({ ids: selected, projectId: id || null }))
          }
          busy={pending === "product"}
        />

        <Menu
          label="Assign to"
          primary
          open={menu === "assign"}
          onToggle={() => setMenu((m) => (m === "assign" ? null : "assign"))}
          items={assignees.map((u) => ({ id: u.id, label: u.name }))}
          onPick={(id) => run("assign", () => bulkAssign({ ids: selected, userId: id }))}
          busy={pending === "assign"}
        />

        {armed === "revoke" ? (
          <Confirm
            text={`Take ${n} ${noun} back?`}
            busy={pending === "revoke"}
            onYes={() => run("revoke", () => revokeLeads({ ids: selected }))}
            onNo={() => setArmed(null)}
          />
        ) : (
          <BarButton tone="warn" onClick={() => setArmed("revoke")} title="Return to unassigned">
            <Ban className="h-3.5 w-3.5" /> Revoke
          </BarButton>
        )}

        <BarButton onClick={exportCsv} title="Export selected">
          <Download className="h-3.5 w-3.5" />
        </BarButton>

        {canDelete && (
          armed === "delete" ? (
            <Confirm
              text={`Delete ${n} ${noun}? This cannot be undone.`}
              busy={pending === "delete"}
              onYes={() => run("delete", () => deleteLeads(selected))}
              onNo={() => setArmed(null)}
            />
          ) : (
            <BarButton tone="danger" onClick={() => setArmed("delete")} title="Delete selected">
              <Trash2 className="h-3.5 w-3.5" />
            </BarButton>
          )
        )}

        <BarButton onClick={onClear} title="Clear selection">
          <X className="h-3.5 w-3.5" />
        </BarButton>

        {error && <span className="w-full px-1 text-xs text-rose-300">{error}</span>}
        {note && <span className="w-full px-1 text-xs text-emerald-300">{note}</span>}
      </div>
    </div>
  );
}

function BarButton({
  children, onClick, tone, title,
}: {
  children: React.ReactNode; onClick: () => void;
  tone?: "danger" | "warn" | "primary"; title?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} title={title} aria-label={title}
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
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-xs">
      <span className="text-white/80">{text}</span>
      <button type="button" onClick={onYes} disabled={busy}
        className="rounded-lg bg-rose-500 px-2 py-1 font-semibold text-white disabled:opacity-60">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes"}
      </button>
      <button type="button" onClick={onNo}
        className="rounded-lg px-2 py-1 text-white/70 hover:bg-white/10">No</button>
    </span>
  );
}

function Menu({
  label, items, onPick, open, onToggle, busy, primary,
}: {
  label: string;
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  open: boolean; onToggle: () => void; busy: boolean; primary?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <span className="relative">
      <BarButton tone={primary ? "primary" : undefined} onClick={onToggle}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
        <ChevronDown className="h-3 w-3 opacity-70" />
      </BarButton>
      {open && (
        /* Opens UPWARD: the bar sits at the bottom of the viewport, so a menu dropping
           down would open off-screen. */
        <div className="absolute bottom-full left-0 z-30 mb-2 max-h-64 w-56 overflow-y-auto rounded-xl border bg-card p-1 text-foreground shadow-lg">
          {items.map((it) => (
            <button
              key={it.id || "none"} type="button" onClick={() => onPick(it.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
            >
              <Check className="h-3.5 w-3.5 opacity-0" />
              <span className="truncate">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
