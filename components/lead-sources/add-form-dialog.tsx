"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Check, ChevronDown, FileText, Loader2, CircleAlert } from "lucide-react";
import {
  listAvailableForms,
  listFormFields,
  addPageForm,
  type AvailablePage,
} from "@/server/capture/actions";
import { cn } from "@/lib/utils";

/**
 * Pick a lead form off your own Facebook page.
 *
 * This exists to delete a job nobody should have: copying a form id out of the Meta
 * console into a text box. That job produced the "met1 campaign" row still sitting in
 * this CRM pointing at an APP id instead of a form id — a mapping that can never match
 * a lead and gives no error when it does not. Facebook knows the ids; the agent should
 * only ever pick a name.
 *
 * Opening the dialog reads the pages live. Questions are fetched only when a row is
 * expanded, because one Graph call per form would make a page with thirty Messenger
 * auto-forms take ten seconds to open.
 */
export function AddFormDialog({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [pages, setPages] = React.useState<AvailablePage[] | null>(null);
  const [activePage, setActivePage] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  function onOpen() {
    setOpen(true);
    setError(null);
    setLoading(true);
    void listAvailableForms().then((res) => {
      setLoading(false);
      if (!res.success) {
        setError(res.error ?? "Could not read your pages.");
        return;
      }
      setPages(res.data);
      setActivePage(0);
    });
  }

  function refresh() {
    void listAvailableForms().then((res) => {
      if (res.success) setPages(res.data);
    });
    router.refresh();
  }

  const page = pages?.[activePage];

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        title={disabled ? "Connect a Facebook page first" : undefined}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        New
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Add a lead form"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg rounded-2xl border bg-card shadow-lg">
            <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">
                  {page ? page.pageName : "Your Facebook pages"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Pick a form — its id comes from Facebook, you never type one.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            {/* Only shown when there is a choice to make. */}
            {pages && pages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto border-b px-5 py-2">
                {pages.map((p, i) => (
                  <button
                    key={p.capturePageId}
                    type="button"
                    onClick={() => setActivePage(i)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      i === activePage
                        ? "border-primary bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.pageName}
                  </button>
                ))}
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto">
              {loading && (
                <p className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Reading your forms from Facebook…
                </p>
              )}

              {error && (
                <p className="flex items-start gap-2 px-5 py-8 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              {page?.error && (
                <p className="flex items-start gap-2 px-5 py-8 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {page.pageName} could not be read: {page.error}
                </p>
              )}

              {page && !page.error && page.forms.length === 0 && (
                <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                  This page has no lead forms on Facebook yet. Create one in Ads Manager, then
                  come back — it will show up here.
                </p>
              )}

              {page && page.forms.length > 0 && (
                <>
                  <p className="bg-muted/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Active
                  </p>
                  <ul className="divide-y">
                    {page.forms.map((form) => (
                      <FormRow
                        key={form.externalFormId}
                        capturePageId={page.capturePageId}
                        form={form}
                        onAdded={refresh}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>

            <footer className="border-t px-5 py-3 text-[11px] text-muted-foreground">
              A form you add starts with no project. Set that on its card, so its leads count
              towards the right launch.
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function FormRow({
  capturePageId,
  form,
  onAdded,
}: {
  capturePageId: string;
  form: { externalFormId: string; name: string; status: string | null; leadsCount: number | null; configured: boolean };
  onAdded: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [fields, setFields] = React.useState<{ key: string; label: string }[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [added, setAdded] = React.useState(false);

  const done = form.configured || added;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (!next || fields) return; // Questions are immutable once a form exists — fetch once.
    setBusy(true);
    void listFormFields(capturePageId, form.externalFormId).then((res) => {
      setBusy(false);
      if (!res.success) return setError(res.error ?? "Could not read that form.");
      setFields(res.data);
    });
  }

  function add() {
    setError(null);
    setBusy(true);
    void addPageForm(capturePageId, form.externalFormId).then((res) => {
      setBusy(false);
      if (!res.success) return setError(res.error ?? "Could not add that form.");
      setAdded(true);
      onAdded();
    });
  }

  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          {done ? <Check className="h-4 w-4" /> : <FileText className="h-3.5 w-3.5" />}
        </span>

        <button type="button" onClick={toggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{form.name}</span>
          <span className="block text-xs">
            {done ? (
              <span className="text-emerald-600">Configured</span>
            ) : (
              <span className="text-muted-foreground">
                {fields ? `${fields.length} field${fields.length === 1 ? "" : "s"}` : "Tap to see its fields"}
                {form.leadsCount !== null && ` · ${form.leadsCount} leads on Facebook`}
              </span>
            )}
          </span>
        </button>

        {!done && (
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="shrink-0 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : "Add"}
          </button>
        )}

        <button
          type="button"
          onClick={toggle}
          aria-label={expanded ? "Hide fields" : "Show fields"}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} aria-hidden />
        </button>
      </div>

      {expanded && (
        <div className="bg-muted/30 px-5 pb-3 pl-[3.75rem]">
          {busy && !fields && (
            <p className="py-2 text-xs text-muted-foreground">Reading its questions…</p>
          )}
          {fields && fields.length === 0 && (
            <p className="py-2 text-xs text-muted-foreground">This form asks nothing at all.</p>
          )}
          {fields && fields.length > 0 && (
            <ul className="space-y-1 py-2">
              {fields.map((f) => (
                <li key={f.key} className="flex items-center gap-2 text-xs">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                  <span className="truncate">{f.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="px-5 pb-3 pl-[3.75rem] text-xs text-destructive">{error}</p>}
    </li>
  );
}
