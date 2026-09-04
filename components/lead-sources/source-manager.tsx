"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createLeadFormSource, updateLeadFormSource, deleteLeadFormSource,
} from "@/server/lead-sources/actions";
import type { LeadFormSourceRow } from "@/server/lead-sources/queries";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormAlert } from "@/components/ui/alert";

const PROVIDERS = ["meta", "tally", "typeform", "googleads", "generic"] as const;

interface Draft {
  provider: string;
  externalFormId: string;
  label: string;
  projectId: string;
  defaultInterest: string;
}

const emptyDraft: Draft = {
  provider: "meta", externalFormId: "", label: "", projectId: "", defaultInterest: "",
};

export function LeadSourceManager({
  sources, projects,
}: {
  sources: LeadFormSourceRow[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const set = <K extends keyof Draft>(k: K, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  function onAdd() {
    if (!draft.externalFormId.trim()) return setError("Paste the form id from the ad platform.");
    if (!draft.label.trim()) return setError("Give it a name you will recognise.");
    run(async () => {
      const res = await createLeadFormSource({
        provider: draft.provider,
        externalFormId: draft.externalFormId,
        label: draft.label,
        projectId: draft.projectId || null,
        defaultInterest: draft.defaultInterest || null,
      });
      if (res.success) { setDraft(emptyDraft); setAdding(false); }
      return res;
    });
  }

  return (
    <div className="space-y-3">
      {sources.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No forms mapped yet. Leads from an unmapped form still arrive — they just have no
          project, so they will not appear in that launch&rsquo;s funnel.
        </p>
      )}

      <div className="space-y-2">
        {sources.map((s) => (
          <div key={s.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{s.label}</span>
                  <Badge variant="outline">{s.provider}</Badge>
                  {!s.active && <Badge className="bg-muted text-muted-foreground">paused</Badge>}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{s.externalFormId}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => updateLeadFormSource({ id: s.id, active: !s.active }))}
                >
                  {s.active ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(() => deleteLeadFormSource(s.id))}
                >
                  Remove
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Project</Label>
                <Select
                  className="h-9 w-56"
                  defaultValue={s.projectId ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    run(() => updateLeadFormSource({ id: s.id, projectId: e.target.value || null }))
                  }
                >
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Default interest</Label>
                <Select
                  className="h-9 w-40"
                  defaultValue={s.defaultInterest ?? ""}
                  disabled={pending}
                  onChange={(e) =>
                    run(() =>
                      updateLeadFormSource({ id: s.id, defaultInterest: (e.target.value || null) as never }),
                    )
                  }
                >
                  <option value="">None</option>
                  {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
                </Select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      {!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>Map a form</Button>}

      {adding && (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Platform">
              <Select value={draft.provider} onChange={(e) => set("provider", e.target.value)}>
                {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </Field>
            <Field label="Form id">
              <Input
                placeholder="1234567890123456"
                value={draft.externalFormId}
                onChange={(e) => set("externalFormId", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Name">
            <Input
              placeholder="Skyline Residence — August launch"
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project">
              <Select value={draft.projectId} onChange={(e) => set("projectId", e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Default interest">
              <Select value={draft.defaultInterest} onChange={(e) => set("defaultInterest", e.target.value)}>
                <option value="">None</option>
                {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </Field>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={onAdd}>{pending ? "Saving…" : "Save"}</Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => { setAdding(false); setDraft(emptyDraft); setError(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
