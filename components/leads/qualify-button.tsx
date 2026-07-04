"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { qualifyLead } from "@/server/leads/convert";
import { disqualifyLead } from "@/server/leads/actions";
import { Button } from "@/components/ui/button";

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
      <div className="flex gap-2">
        <Button onClick={onQualify} disabled={pending}>Qualify → Contact</Button>
        <Button variant="outline" onClick={onDisqualify} disabled={pending}>Disqualify</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
