"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { deleteLeads } from "@/server/leads/actions";
import { EditLeadDialog, type EditableLead } from "./edit-lead-dialog";

/**
 * Edit and delete, revealed on row hover so the table stays quiet at rest.
 *
 * Always focusable, never merely hidden: `opacity-0` with `focus-within` and
 * `group-hover` keeps the buttons reachable by keyboard and always present on touch,
 * where there is no hover to reveal them.
 */
export function LeadRowActions({
  lead, projects, canDelete,
}: {
  lead: EditableLead;
  projects: { id: string; name: string }[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function remove() {
    setPending(true);
    setError(null);
    void (async () => {
      const res = await deleteLeads([lead.id]);
      setPending(false);
      setArmed(false);
      if (!res.success) return setError(res.error ?? "Could not delete.");
      if (res.data.skipped > 0) {
        return setError("That lead became a contact — delete it from Contacts instead.");
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
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>

        {canDelete && (
          armed ? (
            /* Names the lead rather than asking "are you sure?" — a generic confirm is
               dismissed by reflex, and this removes a client's enquiry record. */
            <span className="flex items-center gap-1 whitespace-nowrap text-xs">
              <span className="text-muted-foreground">Delete {lead.name}?</span>
              <button type="button" onClick={remove} disabled={pending}
                className="rounded-md px-1.5 py-0.5 font-semibold text-destructive hover:bg-destructive/10">
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes"}
              </button>
              <button type="button" onClick={() => setArmed(false)}
                className="rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-secondary">
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setArmed(true)}
              aria-label={`Delete ${lead.name}`}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      {error && <p className="mt-1 text-right text-xs text-destructive">{error}</p>}

      {editing && (
        <EditLeadDialog lead={lead} projects={projects} onClose={() => setEditing(false)} />
      )}
    </>
  );
}
