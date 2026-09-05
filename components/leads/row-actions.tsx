"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteLeads } from "@/server/leads/actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EditLeadDialog, type EditableLead } from "./edit-lead-dialog";

/**
 * Edit and delete, revealed on row hover so the table stays quiet at rest.
 *
 * Always focusable, never merely hidden: `opacity-0` with `focus-within` and
 * `group-hover` keeps the buttons reachable by keyboard and always present on touch,
 * where there is no hover to reveal them.
 *
 * Failures are reported UPWARD rather than printed here. This cell is pinned and
 * roughly 6rem wide; "That lead became a contact — delete it from Contacts instead."
 * rendered inside it is a column of single words.
 */
export function LeadRowActions({
  lead, projects, canDelete, onError,
}: {
  lead: EditableLead;
  projects: { id: string; name: string }[];
  canDelete: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  function remove() {
    setPending(true);
    onError(null);
    void (async () => {
      const res = await deleteLeads([lead.id]);
      setPending(false);
      if (!res.success) return onError(res.error ?? "Could not delete.");
      if (res.data.skipped > 0) {
        return onError("That lead became a contact — delete it from Contacts instead.");
      }
      router.refresh();
    })();
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${lead.name}`}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>

        {canDelete && (
          /* Names the lead rather than asking "are you sure?" — a generic confirm is
             dismissed by reflex, and this removes a client's enquiry record. */
          <ConfirmButton
            question={`Delete ${lead.name}?`}
            confirmLabel="Delete"
            triggerLabel={`Delete ${lead.name}`}
            pending={pending}
            onConfirm={remove}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive-ink focus-visible:opacity-100"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </ConfirmButton>
        )}
      </div>

      {editing && (
        <EditLeadDialog lead={lead} projects={projects} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
