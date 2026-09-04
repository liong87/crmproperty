"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateLead } from "@/server/leads/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/alert";
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
 * Whole ringgit, digits only, with the separators people paste out of a listing.
 *
 * `inputMode="numeric"` rather than `type="number"`, matching lead-form: a number input
 * silently discards "850,000" on some browsers, scrolls its own value on a trackpad,
 * and reports an empty string for anything it dislikes — so the rejection has to be
 * ours, said in words, rather than the browser's, said not at all.
 */
const MONEY = /^\d{1,12}$/;
const cleanMoney = (v: string) => v.replace(/[\s,]/g, "");

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
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const initial = React.useMemo(() => ({
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
  }), [lead]);

  const [f, setF] = React.useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }));

  const dirty = React.useMemo(
    () => (Object.keys(initial) as (keyof typeof initial)[]).some((k) => f[k] !== initial[k]),
    [f, initial],
  );

  /*
   * Escape and the backdrop go through here, not straight to `onClose`.
   *
   * Escape is a reflex, and the dialog is a form: dismissing it used to throw away
   * every edit in it with no way back and no acknowledgement that anything was lost.
   */
  const requestClose = React.useCallback(() => {
    if (dirty && !pending) setConfirmDiscard(true);
    else onClose();
  }, [dirty, pending, onClose]);

  const canSave = f.name.trim().length > 0 && f.phone.trim().length > 0 && !pending;
  // Meta carries a campaign hierarchy; everything else has one meaningful detail.
  const isMeta = f.source === "webhook" || f.source === "api";

  function save() {
    const next: Record<string, string> = {};
    for (const k of ["budgetMin", "budgetMax"] as const) {
      const v = cleanMoney(f[k]);
      if (v !== "" && !MONEY.test(v)) next[k] = "Whole ringgit only, e.g. 850000.";
    }
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      setError("Check the budget — it must be a number in whole ringgit.");
      return;
    }

    setError(null);
    setFieldErrors({});
    setPending(true);
    const rm = (v: string) => (cleanMoney(v) === "" ? null : Math.round(Number(cleanMoney(v)) * 100));
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
      if (!res.success) {
        // The server knows which field it rejected; print it beside that field rather
        // than as one more sentence at the bottom of a long form.
        setFieldErrors(res.fieldErrors ?? {});
        return setError(res.error ?? "Could not save.");
      }
      onClose();
      router.refresh();
    })();
  }

  return (
    <Dialog
      open
      onClose={requestClose}
      title="Edit lead"
      /* The phone as subtitle, so you can confirm you opened the right row. */
      description={lead.phone}
      className="sm:max-w-xl"
      // Focus lands on the first field rather than the close button, which is what the
      // dialog would otherwise pick. Cast: React 19 types a null-initialised ref as
      // `RefObject<T | null>`, and Dialog asks for `RefObject<HTMLElement>`.
      initialFocus={nameRef as React.RefObject<HTMLElement>}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!canSave}>
            {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {confirmDiscard && (
          <FormAlert focusOnMount>
            <p>Discard your changes to {lead.name}?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="destructive" size="sm" onClick={onClose}>Discard</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
            </div>
          </FormAlert>
        )}

        <Field id="e-name" label="Full name" required error={fieldErrors.name}>
          {(p) => (
            <Input
              {...p}
              ref={nameRef}
              autoComplete="name"
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="e-phone" label="Contact number" required error={fieldErrors.phone}>
            {(p) => (
              <Input
                {...p}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={f.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+60123456789"
              />
            )}
          </Field>
          <Field id="e-email" label="Email" error={fieldErrors.email}>
            {(p) => (
              <Input
                {...p}
                type="email"
                autoComplete="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="optional"
              />
            )}
          </Field>
        </div>

        <Field id="e-project" label="Product" error={fieldErrors.projectId}>
          {(p) => (
            <Select {...p} value={f.projectId} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">No project · resale &amp; rental</option>
              {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </Select>
          )}
        </Field>

        {/* Structured qualification — the thing the competitor keeps in one freeform
            blob and therefore cannot filter or match on. */}
        <Section label="Qualification" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="e-interest" label="Interest" error={fieldErrors.interest}>
            {(p) => (
              <Select {...p} value={f.interest} onChange={(e) => set("interest", e.target.value)}>
                <option value="">—</option>
                {INTEREST.map((i) => <option key={i} value={i} className="capitalize">{i}</option>)}
              </Select>
            )}
          </Field>
          <Field id="e-bmin" label="Budget from (RM)" error={fieldErrors.budgetMin}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={f.budgetMin}
                onChange={(e) => set("budgetMin", e.target.value)}
                placeholder="450000"
              />
            )}
          </Field>
          <Field id="e-bmax" label="Budget to (RM)" error={fieldErrors.budgetMax}>
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                value={f.budgetMax}
                onChange={(e) => set("budgetMax", e.target.value)}
                placeholder="700000"
              />
            )}
          </Field>
        </div>

        <Section label="Source" />
        <p className="text-xs text-muted-foreground">
          Where it came from: <span className="font-medium capitalize text-foreground">{f.source}</span>.
          How it arrived is a fact about the past, so it is not editable — only the
          detail beneath it is.
        </p>
        {isMeta ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="e-camp" label="Campaign">
              {(p) => <Input {...p} value={f.utmCampaign} onChange={(e) => set("utmCampaign", e.target.value)} />}
            </Field>
            <Field id="e-adset" label="Ad set">
              {(p) => <Input {...p} value={f.utmContent} onChange={(e) => set("utmContent", e.target.value)} />}
            </Field>
            <Field id="e-ad" label="Ad">
              {(p) => <Input {...p} value={f.utmTerm} onChange={(e) => set("utmTerm", e.target.value)} />}
            </Field>
          </div>
        ) : (
          <Field id="e-detail" label="Detail">
            {(p) => (
              <Input
                {...p}
                value={f.sourceDetail}
                onChange={(e) => set("sourceDetail", e.target.value)}
                placeholder="Landing page, form name, referrer…"
              />
            )}
          </Field>
        )}

        <Section label="Lead info" />
        <div className="space-y-1.5">
          <Label htmlFor="e-info">Lead info</Label>
          <Textarea
            id="e-info"
            rows={3}
            value={f.info}
            onChange={(e) => set("info", e.target.value)}
            placeholder="Anything the structured fields above do not cover…"
          />
        </div>

        <p className="text-xs text-muted-foreground">Entered {stamp(lead.createdAt)}</p>
        {error && <FormAlert>{error}</FormAlert>}
      </div>
    </Dialog>
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
