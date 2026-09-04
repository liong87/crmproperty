"use client";
import * as React from "react";
import { deleteProject } from "@/server/projects/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/alert";

/** Soft-delete, behind an arm-then-confirm that names the project. */
export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await deleteProject(projectId);
      // Success redirects; only failures return here.
      if (res && !res.success) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ConfirmButton
        variant="outline"
        onConfirm={onDelete}
        question={`Delete “${name}”?`}
        confirmLabel={pending ? "Deleting…" : "Delete project"}
        pending={pending}
      >
        Delete
      </ConfirmButton>
      {error && <FormAlert className="w-full">{error}</FormAlert>}
    </div>
  );
}
