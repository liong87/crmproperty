"use client";
import * as React from "react";
import { deleteProperty } from "@/server/properties/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/alert";

/**
 * Soft-delete, behind an arm-then-confirm. The question names the listing: on a detail
 * page the heading has scrolled away as often as not, and "Are you sure?" is not a
 * question anybody can answer.
 */
export function DeletePropertyButton({ propertyId, title }: { propertyId: string; title: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await deleteProperty(propertyId);
      // Success redirects; only failures return here.
      if (res && !res.success) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmButton
        variant="outline"
        onConfirm={onDelete}
        question={`Delete “${title}”?`}
        confirmLabel={pending ? "Deleting…" : "Delete listing"}
        pending={pending}
      >
        Delete
      </ConfirmButton>
      {error && <FormAlert className="w-full">{error}</FormAlert>}
    </div>
  );
}
