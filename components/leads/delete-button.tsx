"use client";
import * as React from "react";
import { deleteLead } from "@/server/leads/actions";
import { Button } from "@/components/ui/button";

/**
 * Two-step delete, mirroring the property one: the first click arms it, the second
 * removes the lead. Deliberately not a browser confirm() dialog — those are easy to
 * dismiss by reflex, and this removes a client's enquiry record.
 */
export function DeleteLeadButton({ leadId }: { leadId: string }) {
  const [armed, setArmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await deleteLead(leadId);
      // On success the action redirects; only failures return here.
      if (res && !res.success) {
        setError(res.error);
        setArmed(false);
      }
    });
  }

  if (!armed) {
    return (
      <Button size="sm" variant="outline" onClick={() => setArmed(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
        {pending ? "Deleting…" : "Confirm delete"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
        Cancel
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
