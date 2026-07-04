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
import { Label } from "@/components/ui/label";
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
  const [pending, start] = React.useTransition();
  const { register, handleSubmit } = useForm<Values>({ defaultValues: { ...empty, ...defaults } });

  const onSubmit = handleSubmit((v) => {
    setError(null);
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
      if (!res.success) return setError(res.error);
      const id = "id" in res.data ? res.data.id : propertyId;
      router.push(`/properties/${id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...register("title", { required: true })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Listing type"><Select {...register("listingType")}>{LISTING_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Property type"><Select {...register("propertyType")}>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="State"><Select {...register("state")}>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Area"><Input {...register("area", { required: true })} /></Field>
      </div>
      <Field label="Address"><Input {...register("address")} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Asking price (RM)"><Input type="number" min="0" {...register("askingPriceRM", { required: true })} /></Field>
        <Field label="Built-up (sqft)"><Input type="number" min="0" {...register("builtUpSqft")} /></Field>
        <Field label="Land (sqft)"><Input type="number" min="0" {...register("landSqft")} /></Field>
        <Field label="Bedrooms"><Input type="number" min="0" {...register("bedrooms")} /></Field>
        <Field label="Bathrooms"><Input type="number" min="0" {...register("bathrooms")} /></Field>
        <Field label="Car parks"><Input type="number" min="0" {...register("carParks")} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tenure"><Select {...register("tenure")}><option value="">—</option>{TENURE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Leasehold expiry (year)"><Input type="number" {...register("leaseholdExpiry")} /></Field>
        <Field label="Title type"><Select {...register("titleType")}><option value="">—</option>{TITLE_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Furnishing"><Select {...register("furnishing")}><option value="">—</option>{FURNISHING.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
        <Field label="Status"><Select {...register("status")}>{PROPERTY_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("bumiLot")} /> Bumi lot
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Owner name"><Input {...register("ownerName")} /></Field>
        <Field label="Owner phone"><Input placeholder="+60123456789" {...register("ownerPhone")} /></Field>
      </div>
      {canAssign && (
        <Field label="Assigned agent">
          <Select {...register("assignedAgent")}>
            <option value="">Me</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      )}
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
