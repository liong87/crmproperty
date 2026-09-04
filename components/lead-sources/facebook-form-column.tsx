"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { updateLeadFormSource, deleteLeadFormSource } from "@/server/lead-sources/actions";
import { AddFormDialog } from "./add-form-dialog";
import { FieldMapDialog } from "./field-map-dialog";
import type { LeadFormSourceRow } from "@/server/lead-sources/queries";
import { cn } from "@/lib/utils";
import { FormAlert } from "@/components/ui/alert";

export interface FormRow extends LeadFormSourceRow {
  /** Name of the Facebook page this form came in through, if we know it. */
  pageName: string | null;
}

/**
 * The Facebook lead forms feeding the CRM.
 *
 * Deliberately a LIST OF FORMS, not a mapping table. The old screen made you type a
 * form id and pick a project before anything worked, which is a configuration exercise
 * dressed up as a feature. Here a form arrives with its connection already attached,
 * and the only decision left — which project it feeds — is one dropdown on the row.
 */
export function FacebookFormColumn({
  forms,
  projects,
  canManage,
  hasConnection,
}: {
  forms: FormRow[];
  projects: { id: string; name: string }[];
  canManage: boolean;
  /** A connected page exists, so importing can actually return something. */
  hasConnection: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | "live" | "unmapped">("all");

  const shown = forms.filter((f) => {
    if (filter === "live" && !f.active) return false;
    if (filter === "unmapped" && f.projectId) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      f.label.toLowerCase().includes(q) ||
      f.externalFormId.toLowerCase().includes(q) ||
      (f.pageName ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Facebook forms
            <span className="tabular-nums text-muted-foreground">{forms.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Leads from your lead forms</p>
        </div>
        {canManage && <AddFormDialog disabled={!hasConnection} />}
      </header>

      <div className="relative mt-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search form name…"
          className="h-10 w-full rounded-xl border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {(
          [
            ["all", "All"],
            ["live", "Active"],
            ["unmapped", "No project"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition",
              filter === key
                ? "border-primary bg-primary/10 text-primary"
                : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex-1 space-y-2">
        {shown.length === 0 && (
          <p className="rounded-xl border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
            {forms.length === 0
              ? "No forms yet. Connect a Facebook page on the right, then click New to pick one of its lead forms."
              : "No form matches that."}
          </p>
        )}
        {shown.map((form) => (
          <FormCard key={form.id} form={form} projects={projects} canManage={canManage} />
        ))}
      </div>

    </section>
  );
}

function FormCard({
  form,
  projects,
  canManage,
}: {
  form: FormRow;
  projects: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  function remove() {
    setError(null);
    start(async () => {
      const res = await deleteLeadFormSource(form.id);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function patch(fields: Record<string, unknown>) {
    setError(null);
    start(async () => {
      const res = await updateLeadFormSource({ id: form.id, ...fields });
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{form.label}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                form.active ? "bg-emerald-500" : "bg-muted-foreground/40",
              )}
            />
            {form.pageName ? (
              <>
                <span className="text-emerald-600">Connected</span>
                <span className="truncate">· {form.pageName}</span>
              </>
            ) : (
              <span className="truncate">{form.active ? "Active" : "Paused"}</span>
            )}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* A switch, not a Pause button. The state IS the control, so it reads at a
                glance across a list of ten forms. */}
            <button
              type="button"
              role="switch"
              aria-checked={form.active}
              aria-label={form.active ? "Pause this form" : "Activate this form"}
              disabled={pending}
              onClick={() => patch({ active: !form.active })}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition",
                form.active ? "bg-primary" : "bg-muted-foreground/30",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                  form.active ? "left-[1.125rem]" : "left-0.5",
                )}
              />
            </button>
            <FieldMapDialog sourceId={form.id} label={form.label} current={form.fieldMap ?? null} />
            {/* Confirm-in-place rather than a dialog: removing one form is small, and a
                modal for it would be more ceremony than the action deserves. */}
            {confirming ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="rounded-lg bg-destructive px-2 py-1 text-[11px] font-semibold text-destructive-foreground"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                aria-label="Remove this form"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {canManage && (
        <div className="mt-2.5 flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor={`p-${form.id}`}>
            Project
          </label>
          <select
            id={`p-${form.id}`}
            value={form.projectId ?? ""}
            disabled={pending}
            onChange={(e) => patch({ projectId: e.target.value || null })}
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-xs outline-none focus:border-primary"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <FormAlert className="mt-2">{error}</FormAlert>}
    </div>
  );
}
