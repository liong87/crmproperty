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
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/alert";
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
 * The server speaks in basis points and ISO instants; this form is in percent and
 * dates. A Zod field error keyed to the server's name would otherwise never reach the
 * input the user has to fix.
 */
const SERVER_FIELD_ALIASES: Record<string, keyof ProjectFormValues> = {
  bumiDiscountBp: "bumiDiscountPct",
  developerCommissionBp: "developerCommissionPct",
  launchAt: "launchDate",
  expectedVpAt: "expectedVpDate",
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
  const [serverFields, setServerFields] = React.useState<Partial<Record<keyof ProjectFormValues, string>>>({});
  const [pending, start] = React.useTransition();
  /*
   * `formState` is read here for the same reason it is on the lead form: registering a
   * field as `{ required: true }` with no message and nothing rendered made Save a
   * no-op on a blank Project name — the submit was refused in the library and the
   * screen did not change.
   */
  const {
    register,
    handleSubmit,
    formState: { errors, submitCount },
  } = useForm<ProjectFormValues>({
    defaultValues: { ...empty, ...defaults },
  });

  const fieldError = (name: keyof ProjectFormValues) =>
    (errors[name]?.message as string | undefined) ?? serverFields[name];

  const onSubmit = handleSubmit((v) => {
    setError(null);
    setServerFields({});
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
      if (!res.success) {
        setError(res.error);
        if (res.fieldErrors) {
          setServerFields(
            Object.fromEntries(
              Object.entries(res.fieldErrors).map(([k, m]) => [SERVER_FIELD_ALIASES[k] ?? k, m]),
            ),
          );
        }
        return;
      }
      const id = "id" in res.data ? res.data.id : projectId;
      router.push(`/projects/${id}`);
      router.refresh();
    });
  });

  const blocked = Object.keys(errors).length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Announced and focused, so a refused submit is heard rather than guessed at. */}
      {blocked && (
        <FormAlert key={`invalid-${submitCount}`} focusOnMount>
          This project is not saved yet — the fields marked below need attention.
        </FormAlert>
      )}
      {error && <FormAlert key={`error-${submitCount}`} focusOnMount>{error}</FormAlert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Project name" required error={fieldError("name")}>
          {(p) => <Input {...p} {...register("name", { required: "Give the project a name." })} />}
        </Field>
        <Field id="developer" label="Developer" error={fieldError("developer")}>
          {(p) => <Input {...p} {...register("developer")} />}
        </Field>
        <Field id="state" label="State" required error={fieldError("state")}>
          {(p) => <Select {...p} {...register("state")}>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="area" label="Area" required error={fieldError("area")}>
          {(p) => <Input {...p} placeholder="Mont Kiara" {...register("area", { required: "Which area is it in?" })} />}
        </Field>
      </div>

      <Field id="address" label="Address" error={fieldError("address")}>
        {(p) => <Input {...p} {...register("address")} />}
      </Field>
      <Field id="galleryAddress" label="Sales gallery address" error={fieldError("galleryAddress")}>
        {(p) => <Input {...p} placeholder="Where appointments are held" {...register("galleryAddress")} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="propertyType" label="Property type" error={fieldError("propertyType")}>
          {(p) => <Select {...p} {...register("propertyType")}><option value="">—</option>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="tenure" label="Tenure" error={fieldError("tenure")}>
          {(p) => <Select {...p} {...register("tenure")}><option value="">—</option>{TENURE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="titleType" label="Title type" error={fieldError("titleType")}>
          {(p) => <Select {...p} {...register("titleType")}><option value="">—</option>{TITLE_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="launchDate" label="Launch date" error={fieldError("launchDate")}>
          {(p) => <Input {...p} type="date" {...register("launchDate")} />}
        </Field>
        <Field id="expectedVpDate" label="Expected VP" error={fieldError("expectedVpDate")}>
          {(p) => <Input {...p} type="date" {...register("expectedVpDate")} />}
        </Field>
        <Field id="totalUnits" label="Total units" error={fieldError("totalUnits")}>
          {(p) => <Input {...p} type="number" min="0" {...register("totalUnits")} />}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="bumiQuotaPct" label="Bumi quota (%)" error={fieldError("bumiQuotaPct")}>
          {(p) => <Input {...p} type="number" min="0" max="100" {...register("bumiQuotaPct")} />}
        </Field>
        <Field id="bumiDiscountPct" label="Bumi discount (%)" error={fieldError("bumiDiscountPct")}>
          {(p) => <Input {...p} type="number" min="0" max="100" step="0.01" {...register("bumiDiscountPct")} />}
        </Field>
        <Field id="developerCommissionPct" label="Developer commission (%)" error={fieldError("developerCommissionPct")}>
          {(p) => <Input {...p} type="number" min="0" max="100" step="0.01" {...register("developerCommissionPct")} />}
        </Field>
      </div>

      <Field id="rebatePackage" label="Rebate package" error={fieldError("rebatePackage")}>
        {(p) => <Textarea {...p} rows={2} placeholder="10% early bird, free legal fees, free S&amp;P" {...register("rebatePackage")} />}
      </Field>
      <Field
        id="passOnAfterDays"
        label="Pass leads on after (days)"
        error={fieldError("passOnAfterDays")}
        hint={
          <>
            A lead with nothing logged for this many days moves to the next person in this
            project&rsquo;s pool. Both agents are told and the hand-over is recorded. Applies
            only to this project&rsquo;s leads — resale leads are never moved automatically.
          </>
        }
      >
        {(p) => <Input {...p} type="number" min="1" max="365" placeholder="Leave empty to never pass on" {...register("passOnAfterDays")} />}
      </Field>
      <Field id="notes" label="Notes" error={fieldError("notes")}>
        {(p) => <Textarea {...p} rows={3} {...register("notes")} />}
      </Field>
      <Field id="status" label="Status" error={fieldError("status")}>
        {(p) => <Select {...p} {...register("status")}>{PROJECT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
