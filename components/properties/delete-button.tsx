"use client";
import * as React from "react";
import { deleteProperty } from "@/server/properties/actions";
import { Button } from "@/components/ui/button";

/** Two-step delete: click reveals confirm, second click soft-deletes. */
export function DeletePropertyButton({ propertyId }: { propertyId: string }) {
  const [armed, setArmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await deleteProperty(propertyId);
      // Success redirects; only failures return here.
      if (res && !res.success) { setError(res.error); setArmed(false); }
    });
  }

  if (!armed) {
    return <Button size="sm" variant="outline" onClick={() => setArmed(true)}>Delete</Button>;
  }
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
        {pending ? "Deleting…" : "Confirm delete"}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArmed(false)}>Cancel</Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
