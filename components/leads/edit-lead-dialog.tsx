"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import { updateLead } from "@/server/leads/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface EditableLead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  sourceDetail: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  interest: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  projectId: string | null;
  info: string | null;
  createdAt: Date;
}

const stamp = (d: Date) =>
  new Intl.DateTimeFormat("en-MY", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kuala_Lumpur",
  }).format(d);

/**
 * Edit a lead over the table, without navigating.
 *
 * The whole point: every edit used to cost a page load out and a page load back, losing
 * scroll position and every active filter. An agent triaging thirty leads paid that
 * sixty times. Nothing here navigates.
 *
 * Ringgit is stored as integer CENTS, so the inputs work in whole ringgit and convert
 * on the way in and out. Doing it any other way is how a budget of RM 500,000 quietly
 * becomes RM 5,000.
 */
export function EditLeadDialog({
  lead, projects, onClose,
}: {
  lead: EditableLead;
  projects: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [f, setF] = React.useState({
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? "",
    projectId: lead.projectId ?? "",
    interest: lead.interest ?? "",
    budgetMin: lead.budgetMin != null ? String(Math.round(lead.budgetMin / 100)) : "",
    budgetMax: lead.budgetMax != null ? String(Math.round(lead.budgetMax / 100)) : "",
    source: lead.source,
    sourceDetail: lead.sourceDetail ?? "",
    utmCampaign: lead.utmCampaign ?? "",
    utmContent: lead.utmContent ?? "",
    utmTerm: lead.utmTerm ?? "",
    info: lead.info ?? "",
  });
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canSave = f.name.trim().length > 0 && f.phone.trim().length > 0 && !pending;
  // Meta carries a campaign hierarchy; everything else has one meaningful detail.
  const isMeta = f.source === "webhook" || f.source === "api";

  function save() {
    setError(null);
    setPending(true);
    const rm = (v: string) => (v.trim() === "" ? null : Math.round(Number(v) * 100));
    void (async () => {
      const res = await updateLead({
        id: lead.id,
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim() || null,
        projectId: f.projectId || null,
        interest: f.interest || null,
        budgetMin: rm(f.budgetMin),
        budgetMax: rm(f.budgetMax),
        sourceDetail: f.sourceDetail.trim() || null,
        utmCampaign: f.utmCampaign.trim() || null,
        utmContent: f.utmContent.trim() || null,
        utmTerm: f.utmTerm.trim() || null,
        info: f.info.trim() || null,
      });
      setPending(false);
      if (!res.success) return setError(res.error ?? "Could not save.");
      onClose();
      router.refresh();
    })();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Edit lead"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl rounded-2xl border border-gray-100 bg-card shadow-lg dark:border-gray-800">
        <div className="flex items-start justify-between border-b p-5">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Edit lead</h2>
            {/* The phone as subtitle, so you can confirm you opened the right row. */}
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{lead.phone}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <Label htmlFor="e-name">Full name <span className="text-destructive">*</span></Label>
            <Input id="e-name" value={f.name} onChange={(e) => set("name", e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-phone">Contact number <span className="text-destructive">*</span></Label>
              <Input id="e-phone" value={f.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="+60123456789" />
            </div>
            <div>
              <Label htmlFor="e-email">Email</Label>
              <Input id="e-email" value={f.email} onChange={(e) => set("email", e.target.value)}
                placeholder="optional" />
            </div>
          </div>

          <div>
            <Label htmlFor="e-project">Product</Label>
            <Select id="e-project" value={f.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">No project · resale &amp; rental</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>

          {/* Structured qualification — the thing the competitor keeps in one freeform
              blob and therefore cannot filter or match on. */}
          <Section label="Qualification" />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="e-interest">Interest</Label>
              <Select id="e-interest" value={f.interest} onChange={(e) => set("interest", e.target.value)}>
                <option value="">—</option>
                {INTEREST.map((i) => <option key={i} value={i} className="capitalize">{i}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="e-bmin">Budget from (RM)</Label>
              <Input id="e-bmin" inputMode="numeric" value={f.budgetMin}
                onChange={(e) => set("budgetMin", e.target.value)} placeholder="450000" />
            </div>
            <div>
              <Label htmlFor="e-bmax">Budget to (RM)</Label>
              <Input id="e-bmax" inputMode="numeric" value={f.budgetMax}
                onChange={(e) => set("budgetMax", e.target.value)} placeholder="700000" />
            </div>
          </div>

          <Section label="Source" />
          <p className="text-xs text-muted-foreground">
            Where it came from: <span className="font-medium capitalize text-foreground">{f.source}</span>.
            How it arrived is a fact about the past, so it is not editable — only the
            detail beneath it is.
          </p>
          {isMeta ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="e-camp">Campaign</Label>
                <Input id="e-camp" value={f.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="e-adset">Ad set</Label>
                <Input id="e-adset" value={f.utmContent} onChange={(e) => set("utmContent", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="e-ad">Ad</Label>
                <Input id="e-ad" value={f.utmTerm} onChange={(e) => set("utmTerm", e.target.value)} />
              </div>
            </div>
          ) : (
            <div>
              <Label htmlFor="e-detail">Detail</Label>
              <Input id="e-detail" value={f.sourceDetail} onChange={(e) => set("sourceDetail", e.target.value)}
                placeholder="Landing page, form name, referrer…" />
            </div>
          )}

          <Section label="Lead info" />
          <Textarea rows={3} value={f.info} onChange={(e) => set("info", e.target.value)}
            placeholder="Anything the structured fields above do not cover…" />

          <p className="text-xs text-muted-foreground">Entered {stamp(lead.createdAt)}</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!canSave}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
