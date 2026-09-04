"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createLead, updateLead } from "@/server/leads/actions";
import { INTEREST } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DuplicateWarning } from "@/components/leads/duplicate-warning";

type Interest = (typeof INTEREST)[number];

export interface LeadFormValues {
  name: string;
  phone: string;
  email: string;
  interest: Interest | "";
  budgetMinRM: string;
  budgetMaxRM: string;
  preferredAreas: string;
  projectId: string;
  assignedTo: string;
  consentGiven: boolean;
}

/**
 * Whole ringgit, digits only, with the separators people paste out of a listing.
 *
 * `inputMode="numeric"` rather than `type="number"`, and the same rule as the edit
 * dialog: a number input drops "850,000" without saying so, changes its value on a
 * stray trackpad scroll, and reports "" for anything it dislikes — so the rejection has
 * to be ours, in words, rather than the browser's, in silence.
 */
const MONEY = /^\d{1,12}$/;
const cleanMoney = (v: string) => v.replace(/[\s,]/g, "");
const moneyRule = (v: string) =>
  cleanMoney(v ?? "") === "" || MONEY.test(cleanMoney(v)) || "Whole ringgit only, e.g. 850000.";

export function LeadForm({
  mode,
  leadId,
  defaults,
  agents,
  canAssign,
  projects = [],
}: {
  mode: "create" | "edit";
  leadId?: string;
  defaults?: Partial<LeadFormValues>;
  agents: { id: string; name: string }[];
  canAssign: boolean;
  /** Open projects. Empty hides the picker, so a resale-only agency never sees it. */
  projects?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  /** Field-level failures the SERVER found — a phone Zod rejected, say. */
  const [serverFields, setServerFields] = React.useState<Record<string, string>>({});
  /*
   * Bumped on every failed submit so the summary REMOUNTS and takes focus again. A
   * second failed attempt is otherwise silent: the box is already there, focus never
   * moves, and on a phone the offending field is behind the keyboard.
   */
  const [failures, setFailures] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  /*
   * `formState` is read, and that is not incidental.
   *
   * It used to be destructured as `{ register, handleSubmit, watch }` with no `errors`
   * rendered anywhere. `handleSubmit` refuses to run when a required field is empty, so
   * tapping Save on a blank name did nothing at all — no message, no red field, no
   * movement. On a phone, where the library's focus-scroll can land behind the keyboard,
   * the agent taps Save repeatedly and concludes the CRM is broken.
   */
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LeadFormValues>({
    defaultValues: {
      name: "", phone: "", email: "", interest: "", budgetMinRM: "", budgetMaxRM: "",
      preferredAreas: "", projectId: "", assignedTo: "", consentGiven: false, ...defaults,
    },
  });

  /** The message for one field, whoever found the problem. */
  const problem = (k: keyof LeadFormValues) =>
    (errors[k]?.message as string | undefined) ?? serverFields[k];

  const summary = (
    [
      ["name", "Name"], ["phone", "Phone"], ["email", "Email"],
      ["budgetMinRM", "Budget min"], ["budgetMaxRM", "Budget max"],
    ] as const
  )
    .map(([k, label]) => ({ k, label, message: problem(k) }))
    .filter((x) => x.message);

  const onSubmit = handleSubmit(
    (v) => {
      setError(null);
      setServerFields({});
      const payload = {
        name: v.name,
        phone: v.phone,
        email: v.email || null,
        interest: v.interest || null,
        budgetMin: cleanMoney(v.budgetMinRM) ? Math.round(Number(cleanMoney(v.budgetMinRM)) * 100) : null,
        budgetMax: cleanMoney(v.budgetMaxRM) ? Math.round(Number(cleanMoney(v.budgetMaxRM)) * 100) : null,
        preferredAreas: v.preferredAreas || null,
        projectId: v.projectId || null,
        assignedTo: canAssign && v.assignedTo ? v.assignedTo : undefined,
        consentGiven: v.consentGiven,
      };
      startTransition(async () => {
        const res =
          mode === "create"
            ? await createLead(payload)
            : await updateLead({ ...payload, id: leadId });
        if (!res.success) {
          /*
           * The action's Zod failure keeps `issue.path`, so a rejected phone lands on
           * the phone input. The keys are the payload's, and `budgetMin` is the form's
           * `budgetMinRM` — one is cents, the other whole ringgit.
           */
          const map: Record<string, string> = { budgetMin: "budgetMinRM", budgetMax: "budgetMaxRM" };
          const fields: Record<string, string> = {};
          for (const [k, m] of Object.entries(res.fieldErrors ?? {})) fields[map[k] ?? k] = m;
          setServerFields(fields);
          setError(res.error);
          setFailures((n) => n + 1);
          return;
        }
        const id = "id" in res.data ? res.data.id : leadId;
        router.push(`/leads/${id}`);
        router.refresh();
      });
    },
    () => setFailures((n) => n + 1),
  );

  return (
    /* noValidate: the messages below are ours, and the browser's own bubble would fire
       first, in its own words, and vanish on the next keystroke. */
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {(error || summary.length > 0) && (
        <FormAlert key={failures} focusOnMount>
          <p className="font-medium">{error ?? "Some details still need fixing."}</p>
          {summary.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {summary.map((s) => (
                <li key={s.k}>
                  {/* Straight to the field, so a long form does not have to be
                      re-read from the top to find what is wrong. */}
                  <a href={`#${s.k}`} className="underline underline-offset-2">
                    {s.label}: {s.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </FormAlert>
      )}

      <Field id="name" label="Name" required error={problem("name")}>
        {(p) => <Input {...p} autoComplete="name" {...register("name", { required: "A name is needed." })} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* type="tel" so a phone opens the numeric keypad rather than a QWERTY
            keyboard — this form is filled in one-handed between viewings. The old
            label read "Phone (E.164)", a notation no negotiator has heard of. */}
        <Field id="phone" label="Phone" required error={problem("phone")}>
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
        <Field id="email" label="Email" error={problem("email")}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...register("email")} />}
        </Field>
      </div>

      {/* Flags a client another agent is already working. Warns; never blocks. */}
      <DuplicateWarning phone={watch("phone") ?? ""} email={watch("email") ?? ""} excludeLeadId={leadId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="interest" label="Interest">
          {(p) => (
            <Select {...p} {...register("interest")}>
              <option value="">—</option>
              {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          )}
        </Field>
        <Field id="budgetMinRM" label="Budget min (RM)" error={problem("budgetMinRM")}>
          {(p) => (
            <Input {...p} inputMode="numeric" {...register("budgetMinRM", { validate: moneyRule })} />
          )}
        </Field>
        <Field id="budgetMaxRM" label="Budget max (RM)" error={problem("budgetMaxRM")}>
          {(p) => (
            <Input {...p} inputMode="numeric" {...register("budgetMaxRM", { validate: moneyRule })} />
          )}
        </Field>
      </div>

      <Field id="preferredAreas" label="Preferred areas">
        {(p) => <Input {...p} placeholder="Mont Kiara, Bangsar" {...register("preferredAreas")} />}
      </Field>

      {projects.length > 0 && (
        <Field
          id="projectId"
          label="Project"
          hint="Which launch this enquiry came in for. Drives the funnel and cost-per-lead."
        >
          {(p) => (
            <Select {...p} {...register("projectId")}>
              <option value="">Not a project enquiry</option>
              {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
            </Select>
          )}
        </Field>
      )}

      {canAssign && (
        <Field id="assignedTo" label="Assign to">
          {(p) => (
            <Select {...p} {...register("assignedTo")}>
              <option value="">Auto / me</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          )}
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("consentGiven")} />
        Consent to be contacted (PDPA)
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
