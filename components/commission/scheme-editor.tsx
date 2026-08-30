"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { saveScheme, deleteScheme } from "@/server/commission/actions";
import type { SchemeWithStages } from "@/server/commission/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface StageDraft { label: string; releaseBp: string; dueDays: string }
interface Draft {
  id?: string;
  name: string;
  description: string;
  developerPct: string;
  agencyPct: string;
  setterPct: string;
  closerPct: string;
  coBrokePct: string;
  isDefault: boolean;
  stages: StageDraft[];
}

const pct = (bp: number) => String(bp / 100);
const toBp = (s: string) => Math.round(Number(s || 0) * 100);
const sum = (xs: string[]) => xs.reduce((a, s) => a + Number(s || 0), 0);

const emptyDraft = (): Draft => ({
  name: "", description: "", developerPct: "",
  agencyPct: "50", setterPct: "25", closerPct: "25", coBrokePct: "0",
  isDefault: false,
  stages: [{ label: "Booking", releaseBp: "100", dueDays: "14" }],
});

const draftFrom = (s: SchemeWithStages): Draft => ({
  id: s.scheme.id,
  name: s.scheme.name,
  description: s.scheme.description ?? "",
  developerPct: s.scheme.developerBp == null ? "" : pct(s.scheme.developerBp),
  agencyPct: pct(s.scheme.agencyBp),
  setterPct: pct(s.scheme.setterBp),
  closerPct: pct(s.scheme.closerBp),
  coBrokePct: pct(s.scheme.coBrokeBp),
  isDefault: s.scheme.isDefault,
  stages: s.stages.map((t) => ({
    label: t.label,
    releaseBp: pct(t.releaseBp),
    dueDays: t.dueDays == null ? "" : String(t.dueDays),
  })),
});

/**
 * Editing the agency's commission configuration.
 *
 * Percentages are shown and typed as percentages; basis points are an implementation
 * detail nobody should have to think in. Both totals are shown live and in colour,
 * because "must add up to 100%" discovered on submit is a worse experience than a
 * running total that is visibly wrong while you type.
 */
export function SchemeEditor({ schemes }: { schemes: SchemeWithStages[] }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }
  function setStage(i: number, patch: Partial<StageDraft>) {
    setDraft((d) =>
      d ? { ...d, stages: d.stages.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    );
  }

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      after?.();
      router.refresh();
    });
  }

  function save() {
    if (!draft) return;
    run(
      () =>
        saveScheme({
          id: draft.id,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          developerBp: draft.developerPct === "" ? null : toBp(draft.developerPct),
          agencyBp: toBp(draft.agencyPct),
          setterBp: toBp(draft.setterPct),
          closerBp: toBp(draft.closerPct),
          coBrokeBp: toBp(draft.coBrokePct),
          isDefault: draft.isDefault,
          stages: draft.stages.map((s) => ({
            label: s.label.trim(),
            releaseBp: toBp(s.releaseBp),
            dueDays: s.dueDays === "" ? null : Number(s.dueDays),
          })),
        }),
      () => setDraft(null),
    );
  }

  if (draft) {
    const splitTotal = sum([draft.agencyPct, draft.setterPct, draft.closerPct, draft.coBrokePct]);
    const stageTotal = sum(draft.stages.map((s) => s.releaseBp));
    const ok = (n: number) => Math.abs(n - 100) < 0.005;

    return (
      <div className="space-y-4 rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Agency default" />
          </Field>
          <Field label="Developer rate (%) — blank uses the project's own">
            <Input type="number" min="0" max="100" step="0.01" value={draft.developerPct}
              onChange={(e) => set("developerPct", e.target.value)} placeholder="e.g. 2.5" />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Split</h3>
            <Total value={splitTotal} ok={ok(splitTotal)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Agency"><Pct value={draft.agencyPct} onChange={(v) => set("agencyPct", v)} /></Field>
            <Field label="Setter"><Pct value={draft.setterPct} onChange={(v) => set("setterPct", v)} /></Field>
            <Field label="Closer"><Pct value={draft.closerPct} onChange={(v) => set("closerPct", v)} /></Field>
            <Field label="Co-broke"><Pct value={draft.coBrokePct} onChange={(v) => set("coBrokePct", v)} /></Field>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            When one agent both sets and closes, their two shares are added together
            rather than listed twice.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold">Release stages</h3>
            <Total value={stageTotal} ok={ok(stageTotal)} />
          </div>
          <div className="space-y-2">
            {draft.stages.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label={i === 0 ? "Stage" : ""}>
                  <Input className="w-44" value={s.label}
                    onChange={(e) => setStage(i, { label: e.target.value })} placeholder="SPA signed" />
                </Field>
                <Field label={i === 0 ? "Released (%)" : ""}>
                  <Input className="w-28" type="number" min="0" max="100" step="0.01"
                    value={s.releaseBp} onChange={(e) => setStage(i, { releaseBp: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Due after (days)" : ""}>
                  <Input className="w-32" type="number" min="0" value={s.dueDays}
                    onChange={(e) => setStage(i, { dueDays: e.target.value })} placeholder="90" />
                </Field>
                <Button size="sm" variant="ghost" type="button"
                  disabled={draft.stages.length === 1}
                  onClick={() => set("stages", draft.stages.filter((_, j) => j !== i))}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" type="button" className="mt-2"
            onClick={() => set("stages", [...draft.stages, { label: "", releaseBp: "0", dueDays: "" }])}>
            Add stage
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.isDefault}
            onChange={(e) => set("isDefault", e.target.checked)} />
          Use this scheme by default on new deals
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 border-t pt-3">
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save scheme"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(null); setError(null); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schemes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No schemes yet. Create one and it becomes the default for new deals.
        </p>
      )}

      {schemes.map((s) => (
        <div key={s.scheme.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{s.scheme.name}</span>
                {s.scheme.isDefault && <Badge>default</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Agency {pct(s.scheme.agencyBp)}% · Setter {pct(s.scheme.setterBp)}% ·
                Closer {pct(s.scheme.closerBp)}%
                {s.scheme.coBrokeBp > 0 && ` · Co-broke ${pct(s.scheme.coBrokeBp)}%`}
                {s.scheme.developerBp != null && ` · developer rate ${pct(s.scheme.developerBp)}%`}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {s.stages.map((t) => `${t.label} ${pct(t.releaseBp)}%`).join(" → ") || "No stages"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setDraft(draftFrom(s))}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" disabled={pending || s.scheme.isDefault}
                onClick={() => run(() => deleteScheme(s.scheme.id))}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button size="sm" variant="outline" onClick={() => { setDraft(emptyDraft()); setError(null); }}>
        New scheme
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs">{label}</Label>}
      {children}
    </div>
  );
}

function Pct({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input type="number" min="0" max="100" step="0.01" value={value}
      onChange={(e) => onChange(e.target.value)} />
  );
}

/** Running total, coloured. Wrong-while-you-type beats wrong-on-submit. */
function Total({ value, ok }: { value: number; ok: boolean }) {
  return (
    <span className={`tnum text-xs font-medium ${ok ? "text-muted-foreground" : "text-destructive"}`}>
      {value.toFixed(2)}% {ok ? "" : "— must total 100%"}
    </span>
  );
}
