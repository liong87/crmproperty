"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createLead, updateLead } from "@/server/leads/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Interest = (typeof INTEREST)[number];

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  interest: Interest | "";
  budgetMinRM: string;
  budgetMaxRM: string;
  preferredAreas: string;
  assignedTo: string;
  consentGiven: boolean;
}

export function LeadForm({
  mode,
  leadId,
  defaults,
  agents,
  canAssign,
}: {
  mode: "create" | "edit";
  leadId?: string;
  defaults?: Partial<LeadFormValues>;
  agents: { id: string; name: string }[];
  canAssign: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const { register, handleSubmit } = useForm<LeadFormValues>({
    defaultValues: {
      name: "", phone: "", email: "", interest: "", budgetMinRM: "", budgetMaxRM: "",
      preferredAreas: "", assignedTo: "", consentGiven: false, ...defaults,
    },
  });

  const onSubmit = handleSubmit((v) => {
    setError(null);
    const payload = {
      name: v.name,
      phone: v.phone,
      email: v.email || null,
      interest: v.interest || null,
      budgetMin: v.budgetMinRM ? Math.round(Number(v.budgetMinRM) * 100) : null,
      budgetMax: v.budgetMaxRM ? Math.round(Number(v.budgetMaxRM) * 100) : null,
      preferredAreas: v.preferredAreas || null,
      assignedTo: canAssign && v.assignedTo ? v.assignedTo : undefined,
      consentGiven: v.consentGiven,
    };
    startTransition(async () => {
      const res =
        mode === "create"
          ? await createLead(payload)
          : await updateLead({ ...payload, id: leadId });
      if (!res.success) {
        setError(res.error);
        return;
      }
      const id = "id" in res.data ? res.data.id : leadId;
      router.push(`/leads/${id}`);
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
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone (E.164)</Label>
          <Input id="phone" placeholder="+60123456789" {...register("phone", { required: true })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...register("email")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="interest">Interest</Label>
          <Select id="interest" {...register("interest")}>
            <option value="">—</option>
            {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budgetMinRM">Budget min (RM)</Label>
          <Input id="budgetMinRM" type="number" min="0" {...register("budgetMinRM")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budgetMaxRM">Budget max (RM)</Label>
          <Input id="budgetMaxRM" type="number" min="0" {...register("budgetMaxRM")} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="preferredAreas">Preferred areas</Label>
        <Input id="preferredAreas" placeholder="Mont Kiara, Bangsar" {...register("preferredAreas")} />
      </div>
      {canAssign && (
        <div className="space-y-1.5">
          <Label htmlFor="assignedTo">Assign to</Label>
          <Select id="assignedTo" {...register("assignedTo")}>
            <option value="">Auto / me</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("consentGiven")} />
        Consent to be contacted (PDPA)
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
