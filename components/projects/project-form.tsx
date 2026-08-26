"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createProject, updateProject } from "@/server/projects/actions";
import {
  PROPERTY_TYPE, TENURE, TITLE_TYPE, PROJECT_STATUS, MALAYSIAN_STATES,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { percentToBp } from "@/lib/utils";

export interface ProjectFormValues {
  name: string; developer: string; propertyType: string; state: string; area: string;
  address: string; galleryAddress: string; tenure: string; titleType: string;
  launchDate: string; expectedVpDate: string; totalUnits: string;
  bumiQuotaPct: string; bumiDiscountPct: string; rebatePackage: string;
  developerCommissionPct: string; passOnAfterDays: string; status: string; notes: string;
}

const empty: ProjectFormValues = {
  name: "", developer: "", propertyType: "condo", state: "Kuala Lumpur", area: "",
  address: "", galleryAddress: "", tenure: "", titleType: "", launchDate: "",
  expectedVpDate: "", totalUnits: "", bumiQuotaPct: "", bumiDiscountPct: "",
  rebatePackage: "", developerCommissionPct: "", passOnAfterDays: "", status: "open", notes: "",
};

/**
 * A bare date input carries no timezone. Malaysia is UTC+8 all year, so pinning the
 * offset explicitly keeps the stored instant on the day the user typed, whatever
 * timezone their device is set to.
 */
function dateToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}


export function ProjectForm({
  mode, projectId, defaults,
}: {
  mode: "create" | "edit";
  projectId?: string;
  defaults?: Partial<ProjectFormValues>;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const { register, handleSubmit } = useForm<ProjectFormValues>({
    defaultValues: { ...empty, ...defaults },
  });

  const onSubmit = handleSubmit((v) => {
    setError(null);
    const num = (s: string) => (s === "" ? null : Number(s));
    const payload = {
      name: v.name,
      developer: v.developer || null,
      propertyType: v.propertyType || null,
      state: v.state,
      area: v.area,
      address: v.address || null,
      galleryAddress: v.galleryAddress || null,
      tenure: v.tenure || null,
      titleType: v.titleType || null,
      launchAt: dateToIso(v.launchDate),
      expectedVpAt: dateToIso(v.expectedVpDate),
      totalUnits: num(v.totalUnits),
      bumiQuotaPct: num(v.bumiQuotaPct),
      bumiDiscountBp: percentToBp(v.bumiDiscountPct),
      rebatePackage: v.rebatePackage || null,
      developerCommissionBp: percentToBp(v.developerCommissionPct),
      passOnAfterDays: num(v.passOnAfterDays),
      status: v.status,
      notes: v.notes || null,
    };
    start(async () => {
      const res =
        mode === "create" ? await createProject(payload) : await updateProject({ ...payload, id: projectId });
      if (!res.success) return setError(res.error);
      const id = "id" in res.data ? res.data.id : projectId;
      router.push(`/projects/${id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name"><Input {...register("name", { required: true })} /></Field>
        <Field label="Developer"><Input {...register("developer")} /></Field>
        <Field label="State"><Select {...register("state")}>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Area"><Input {...register("area", { required: true })} /></Field>
      </div>

      <Field label="Address"><Input {...register("address")} /></Field>
      <Field label="Sales gallery address">
        <Input placeholder="Where appointments are held" {...register("galleryAddress")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Property type"><Select {...register("propertyType")}><option value="">—</option>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Tenure"><Select {...register("tenure")}><option value="">—</option>{TENURE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Title type"><Select {...register("titleType")}><option value="">—</option>{TITLE_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Launch date"><Input type="date" {...register("launchDate")} /></Field>
        <Field label="Expected VP"><Input type="date" {...register("expectedVpDate")} /></Field>
        <Field label="Total units"><Input type="number" min="0" {...register("totalUnits")} /></Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bumi quota (%)"><Input type="number" min="0" max="100" {...register("bumiQuotaPct")} /></Field>
        <Field label="Bumi discount (%)"><Input type="number" min="0" max="100" step="0.01" {...register("bumiDiscountPct")} /></Field>
        <Field label="Developer commission (%)"><Input type="number" min="0" max="100" step="0.01" {...register("developerCommissionPct")} /></Field>
      </div>

      <Field label="Rebate package">
        <Textarea rows={2} placeholder="10% early bird, free legal fees, free S&amp;P" {...register("rebatePackage")} />
      </Field>
      <Field label="Pass leads on after (days)">
        <Input type="number" min="1" max="365" placeholder="Leave empty to never pass on" {...register("passOnAfterDays")} />
        <p className="text-xs text-muted-foreground">
          A lead with nothing logged for this many days moves to the next person in this
          project&rsquo;s pool. Both agents are told and the hand-over is recorded. Applies
          only to this project&rsquo;s leads — resale leads are never moved automatically.
        </p>
      </Field>
      <Field label="Notes"><Textarea rows={3} {...register("notes")} /></Field>
      <Field label="Status"><Select {...register("status")}>{PROJECT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
