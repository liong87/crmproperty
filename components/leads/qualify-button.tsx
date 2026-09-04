"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { qualifyLead } from "@/server/leads/convert";
import { disqualifyLead } from "@/server/leads/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/alert";

/**
 * The two one-way doors on a lead.
 *
 * Both ask before they act, and the delete button is the reason why: deleting a lead is
 * SOFT and reversible, and it asked twice — while qualifying, which converts the lead
 * into a contact and leaves the lead itself read-only for good, was one click on a
 * button labelled with an arrow. The confirmation belongs on the irreversible action.
 *
 * "Qualify → Contact" also described the plumbing rather than the act; the button now
 * says what the person is doing.
 */
export function QualifyButton({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onQualify() {
    setError(null);
    start(async () => {
      const res = await qualifyLead(leadId);
      if (!res.success) return setError(res.error);
      router.push(`/contacts/${res.data.contactId}`);
      router.refresh();
    });
  }
  function onDisqualify() {
    setError(null);
    start(async () => {
      const res = await disqualifyLead(leadId);
      if (!res.success) return setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ConfirmButton
          variant="default"
          size="default"
          question="Qualify as a contact? The lead becomes read-only and cannot be turned back."
          confirmLabel="Qualify"
          pending={pending}
          onConfirm={onQualify}
        >
          Qualify as contact
        </ConfirmButton>
        <ConfirmButton
          variant="outline"
          size="default"
          question="Disqualify this lead? It leaves the working queue and stops being followed up."
          confirmLabel="Disqualify"
          pending={pending}
          onConfirm={onDisqualify}
        >
          Disqualify
        </ConfirmButton>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
