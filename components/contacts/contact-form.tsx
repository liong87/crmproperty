"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { updateContact } from "@/server/contacts/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface Values {
  name: string; phone: string; email: string; interest: string;
  budgetMinRM: string; budgetMaxRM: string; preferredAreas: string;
  idType: string; idNumber: string; nationality: string; occupation: string; notes: string;
}

export function ContactForm({ contactId, defaults }: { contactId: string; defaults: Values }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const { register, handleSubmit } = useForm<Values>({ defaultValues: defaults });

  const onSubmit = handleSubmit((v) => {
    setError(null);
    start(async () => {
      const res = await updateContact({
        id: contactId,
        name: v.name,
        phone: v.phone,
        email: v.email || null,
        interest: v.interest || null,
        budgetMin: v.budgetMinRM ? Math.round(Number(v.budgetMinRM) * 100) : null,
        budgetMax: v.budgetMaxRM ? Math.round(Number(v.budgetMaxRM) * 100) : null,
        preferredAreas: v.preferredAreas || null,
        idType: (v.idType || null) as never,
        idNumber: v.idNumber || null,
        nationality: v.nationality || null,
        occupation: v.occupation || null,
        notes: v.notes || null,
      });
      if (!res.success) return setError(res.error);
      router.push(`/contacts/${contactId}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name", { required: true })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="phone">Phone</Label><Input id="phone" {...register("phone", { required: true })} /></div>
        <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("email")} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="interest">Interest</Label>
          <Select id="interest" {...register("interest")}>
            <option value="">—</option>
            {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="budgetMinRM">Budget min (RM)</Label><Input id="budgetMinRM" type="number" {...register("budgetMinRM")} /></div>
        <div className="space-y-1.5"><Label htmlFor="budgetMaxRM">Budget max (RM)</Label><Input id="budgetMaxRM" type="number" {...register("budgetMaxRM")} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="preferredAreas">Preferred areas</Label><Input id="preferredAreas" {...register("preferredAreas")} /></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="idType">ID type</Label>
          <Select id="idType" {...register("idType")}>
            <option value="">—</option>
            <option value="nric">NRIC</option>
            <option value="passport">Passport</option>
            <option value="company">Company</option>
          </Select>
        </div>
        <div className="space-y-1.5"><Label htmlFor="idNumber">ID number</Label><Input id="idNumber" {...register("idNumber")} /></div>
        <div className="space-y-1.5"><Label htmlFor="nationality">Nationality</Label><Input id="nationality" {...register("nationality")} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="occupation">Occupation</Label><Input id="occupation" {...register("occupation")} /></div>
      <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Textarea id="notes" {...register("notes")} /></div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
