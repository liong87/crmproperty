"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createProperty, updateProperty } from "@/server/properties/actions";
import {
  LISTING_TYPE, PROPERTY_TYPE, TENURE, TITLE_TYPE, FURNISHING, PROPERTY_STATUS, MALAYSIAN_STATES,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";

interface Values {
  title: string; listingType: string; propertyType: string; tenure: string;
  leaseholdExpiry: string; bumiLot: boolean; titleType: string; state: string; area: string;
  address: string; builtUpSqft: string; landSqft: string; bedrooms: string; bathrooms: string;
  carParks: string; askingPriceRM: string; furnishing: string; status: string;
  ownerName: string; ownerPhone: string; assignedAgent: string;
}

const empty: Values = {
  title: "", listingType: "sale", propertyType: "condo", tenure: "", leaseholdExpiry: "",
  bumiLot: false, titleType: "", state: "Kuala Lumpur", area: "", address: "", builtUpSqft: "",
  landSqft: "", bedrooms: "", bathrooms: "", carParks: "", askingPriceRM: "", furnishing: "",
  status: "active", ownerName: "", ownerPhone: "", assignedAgent: "",
};

/**
 * The server names the price field `askingPrice` in cents; the form works in ringgit.
 * Without the alias a Zod field error would arrive keyed to an input that does not
 * exist on this form and would be dropped on the floor.
 */
const SERVER_FIELD_ALIASES: Record<string, keyof Values> = { askingPrice: "askingPriceRM" };

export function PropertyForm({
  mode, propertyId, defaults, agents, canAssign,
}: {
  mode: "create" | "edit";
  propertyId?: string;
  defaults?: Partial<Values>;
  agents: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [serverFields, setServerFields] = React.useState<Partial<Record<keyof Values, string>>>({});
  const [pending, start] = React.useTransition();
  /*
   * `formState` is read, and that is the whole point.
   *
   * This form used to destructure `{ register, handleSubmit }` and register its
   * mandatory fields as `{ required: true }` — no message, nothing rendered anywhere.
   * React Hook Form refuses to submit while a required field is empty, so pressing Save
   * on a blank Title did nothing at all: no message, no red field, no request. The agent
   * either concluded the listing had saved or that the CRM was broken.
   */
  const {
    register,
    handleSubmit,
    formState: { errors, submitCount },
  } = useForm<Values>({ defaultValues: { ...empty, ...defaults } });

  /** A field is wrong if the browser caught it or the server sent it back. */
  const fieldError = (name: keyof Values) =>
    (errors[name]?.message as string | undefined) ?? serverFields[name];

  const onSubmit = handleSubmit((v) => {
    setError(null);
    setServerFields({});
    const num = (s: string) => (s === "" ? null : Number(s));
    const payload = {
      title: v.title,
      listingType: v.listingType,
      propertyType: v.propertyType,
      tenure: v.tenure || null,
      leaseholdExpiry: v.leaseholdExpiry ? Number(v.leaseholdExpiry) : null,
      bumiLot: v.bumiLot,
      titleType: v.titleType || null,
      state: v.state,
      area: v.area,
      address: v.address || null,
      builtUpSqft: num(v.builtUpSqft),
      landSqft: num(v.landSqft),
      bedrooms: num(v.bedrooms),
      bathrooms: num(v.bathrooms),
      carParks: num(v.carParks),
      askingPrice: v.askingPriceRM ? Math.round(Number(v.askingPriceRM) * 100) : 0,
      furnishing: v.furnishing || null,
      status: v.status,
      ownerName: v.ownerName || null,
      ownerPhone: v.ownerPhone || null,
      assignedAgent: canAssign && v.assignedAgent ? v.assignedAgent : undefined,
    };
    start(async () => {
      const res =
        mode === "create" ? await createProperty(payload) : await updateProperty({ ...payload, id: propertyId });
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
      const id = "id" in res.data ? res.data.id : propertyId;
      router.push(`/properties/${id}`);
      router.refresh();
    });
  });

  const blocked = Object.keys(errors).length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/*
        The summary is what makes a refused submit noticeable at all. React Hook Form
        scrolls to the first bad field, which on a phone can land behind the keyboard;
        this is announced and takes focus, so the reason is heard rather than hunted for.
      */}
      {blocked && (
        <FormAlert key={`invalid-${submitCount}`} focusOnMount>
          This listing is not saved yet — the fields marked below need attention.
        </FormAlert>
      )}
      {error && <FormAlert key={`error-${submitCount}`} focusOnMount>{error}</FormAlert>}

      <Field id="title" label="Title" required error={fieldError("title")}>
        {(p) => <Input {...p} {...register("title", { required: "Give the listing a title." })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="listingType" label="Listing type" error={fieldError("listingType")}>
          {(p) => <Select {...p} {...register("listingType")}>{LISTING_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="propertyType" label="Property type" error={fieldError("propertyType")}>
          {(p) => <Select {...p} {...register("propertyType")}>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
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
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="askingPriceRM" label="Asking price (RM)" required error={fieldError("askingPriceRM")}>
          {(p) => <Input {...p} type="number" min="0" {...register("askingPriceRM", { required: "An asking price is needed." })} />}
        </Field>
        <Field id="builtUpSqft" label="Built-up (sqft)" error={fieldError("builtUpSqft")}>
          {(p) => <Input {...p} type="number" min="0" {...register("builtUpSqft")} />}
        </Field>
        <Field id="landSqft" label="Land (sqft)" error={fieldError("landSqft")}>
          {(p) => <Input {...p} type="number" min="0" {...register("landSqft")} />}
        </Field>
        <Field id="bedrooms" label="Bedrooms" error={fieldError("bedrooms")}>
          {(p) => <Input {...p} type="number" min="0" {...register("bedrooms")} />}
        </Field>
        <Field id="bathrooms" label="Bathrooms" error={fieldError("bathrooms")}>
          {(p) => <Input {...p} type="number" min="0" {...register("bathrooms")} />}
        </Field>
        <Field id="carParks" label="Car parks" error={fieldError("carParks")}>
          {(p) => <Input {...p} type="number" min="0" {...register("carParks")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="tenure" label="Tenure" error={fieldError("tenure")}>
          {(p) => <Select {...p} {...register("tenure")}><option value="">—</option>{TENURE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="leaseholdExpiry" label="Leasehold expiry (year)" error={fieldError("leaseholdExpiry")}>
          {(p) => <Input {...p} type="number" min="1900" max="3000" {...register("leaseholdExpiry")} />}
        </Field>
        <Field id="titleType" label="Title type" error={fieldError("titleType")}>
          {(p) => <Select {...p} {...register("titleType")}><option value="">—</option>{TITLE_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="furnishing" label="Furnishing" error={fieldError("furnishing")}>
          {(p) => <Select {...p} {...register("furnishing")}><option value="">—</option>{FURNISHING.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
        <Field id="status" label="Status" error={fieldError("status")}>
          {(p) => <Select {...p} {...register("status")}>{PROPERTY_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}</Select>}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("bumiLot")} /> Bumi lot
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ownerName" label="Owner name" error={fieldError("ownerName")}>
          {(p) => <Input {...p} autoComplete="name" {...register("ownerName")} />}
        </Field>
        <Field
          id="ownerPhone"
          label="Owner phone"
          hint="Stored as +60… so dialling and WhatsApp work from any device."
          error={fieldError("ownerPhone")}
        >
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+60123456789"
              {...register("ownerPhone")}
            />
          )}
        </Field>
      </div>
      {canAssign && (
        <Field id="assignedAgent" label="Assigned agent" error={fieldError("assignedAgent")}>
          {(p) => (
            <Select {...p} {...register("assignedAgent")}>
              <option value="">Me</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
