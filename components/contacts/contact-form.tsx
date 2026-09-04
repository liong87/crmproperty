"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { updateContact } from "@/server/contacts/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";
import { Textarea } from "@/components/ui/textarea";

interface Values {
  name: string; phone: string; email: string; interest: string;
  budgetMinRM: string; budgetMaxRM: string; preferredAreas: string;
  idType: string; idNumber: string; nationality: string; occupation: string; notes: string;
}

/** The server stores budgets in cents; this form is in ringgit. See the property form. */
const SERVER_FIELD_ALIASES: Record<string, keyof Values> = {
  budgetMin: "budgetMinRM",
  budgetMax: "budgetMaxRM",
};

export function ContactForm({ contactId, defaults }: { contactId: string; defaults: Values }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [serverFields, setServerFields] = React.useState<Partial<Record<keyof Values, string>>>({});
  const [pending, start] = React.useTransition();
  /*
   * `formState` is read: Name and Phone were registered as `{ required: true }` with no
   * message and no rendering, so Save on a cleared Phone was a silent no-op.
   */
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, submitCount },
  } = useForm<Values>({ defaultValues: defaults });

  const fieldError = (name: keyof Values) =>
    (errors[name]?.message as string | undefined) ?? serverFields[name];

  const onSubmit = handleSubmit((v) => {
    setError(null);
    setServerFields({});
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
      router.push(`/contacts/${contactId}`);
      router.refresh();
    });
  });

  const blocked = Object.keys(errors).length > 0;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {blocked && (
        <FormAlert key={`invalid-${submitCount}`} focusOnMount>
          This contact is not saved yet — the fields marked below need attention.
        </FormAlert>
      )}
      {error && <FormAlert key={`error-${submitCount}`} focusOnMount>{error}</FormAlert>}

      <Field id="name" label="Name" required error={fieldError("name")}>
        {(p) => <Input {...p} autoComplete="name" {...register("name", { required: "A name is needed." })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label="Phone" required error={fieldError("phone")}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="012-345 6789"
              {...register("phone", { required: "A phone number is needed." })}
            />
          )}
        </Field>
        <Field id="email" label="Email" error={fieldError("email")}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register("email")} />}
        </Field>
      </div>

      {/* Same check as on leads: another agent may already hold this client. */}
      <DuplicateWarning
        phone={watch("phone") ?? ""}
        email={watch("email") ?? ""}
        excludeContactId={contactId}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="interest" label="Interest" error={fieldError("interest")}>
          {(p) => (
            <Select {...p} {...register("interest")}>
              <option value="">—</option>
              {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          )}
        </Field>
        <Field id="budgetMinRM" label="Budget min (RM)" error={fieldError("budgetMinRM")}>
          {(p) => <Input {...p} type="number" min="0" {...register("budgetMinRM")} />}
        </Field>
        <Field id="budgetMaxRM" label="Budget max (RM)" error={fieldError("budgetMaxRM")}>
          {(p) => <Input {...p} type="number" min="0" {...register("budgetMaxRM")} />}
        </Field>
      </div>
      <Field id="preferredAreas" label="Preferred areas" error={fieldError("preferredAreas")}>
        {(p) => <Input {...p} placeholder="Mont Kiara, Bangsar" {...register("preferredAreas")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="idType" label="ID type" error={fieldError("idType")}>
          {(p) => (
            <Select {...p} {...register("idType")}>
              <option value="">—</option>
              <option value="nric">NRIC</option>
              <option value="passport">Passport</option>
              <option value="company">Company</option>
            </Select>
          )}
        </Field>
        <Field id="idNumber" label="ID number" error={fieldError("idNumber")}>
          {(p) => <Input {...p} {...register("idNumber")} />}
        </Field>
        <Field id="nationality" label="Nationality" error={fieldError("nationality")}>
          {(p) => <Input {...p} {...register("nationality")} />}
        </Field>
      </div>
      <Field id="occupation" label="Occupation" error={fieldError("occupation")}>
        {(p) => <Input {...p} {...register("occupation")} />}
      </Field>
      <Field id="notes" label="Notes" error={fieldError("notes")}>
        {(p) => <Textarea {...p} {...register("notes")} />}
      </Field>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
