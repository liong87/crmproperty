"use client";

/**
 * The leads list, with optional multi-select for deletion.
 *
 * Selection lives in component state rather than the URL: it is transient, and a
 * list of ids in the query string would survive a refresh and invite deleting rows
 * the user can no longer see.
 *
 * The header checkbox selects THIS PAGE only. Selecting everything matching the
 * current filter, including rows off screen, is a much easier way to delete far more
 * than intended — what you see selected is what gets deleted.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMYR } from "@/lib/utils";
import { leadStatusTone } from "@/lib/status";
import { deleteLeads } from "@/server/leads/actions";

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  interest: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  assigneeName: string | null;
  status: string;
}

export function LeadsTable({
  rows,
  canDelete,
}: {
  rows: LeadRow[];
  /** Admin only. Without it this renders exactly as the table did before. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [armed, setArmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const pageIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pageIds));
    setArmed(false);
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setArmed(false);
  }

  function onDelete() {
    setError(null);
    start(async () => {
      const res = await deleteLeads([...selected]);
      if (!res.success) {
        setError(res.error);
        setArmed(false);
        return;
      }
      if (res.data.skipped > 0) {
        setError(
          `Deleted ${res.data.deleted}. Skipped ${res.data.skipped} that became contacts — delete those from Contacts.`,
        );
      }
      setSelected(new Set());
      setArmed(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {canDelete && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">
            {selected.size} {selected.size === 1 ? "lead" : "leads"} selected
          </span>
          {/* Two-step, matching DeleteLeadButton: a browser confirm() is dismissed by
              reflex, and this removes a client's enquiry record. */}
          {armed ? (
            <>
              <Button size="sm" variant="destructive" disabled={pending} onClick={onDelete}>
                {pending ? "Deleting…" : `Confirm delete ${selected.size}`}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setArmed(true)}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Table>
        <THead>
          <TR>
            {canDelete && (
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all leads on this page"
                  className="h-4 w-4 cursor-pointer align-middle accent-primary"
                  checked={allSelected}
                  ref={(el) => {
                    // indeterminate is a property, not an attribute.
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                />
              </TH>
            )}
            <TH>Name</TH><TH>Phone</TH><TH>Interest</TH><TH>Budget</TH><TH>Assigned to</TH><TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((l) => (
            <TR key={l.id} className={selected.has(l.id) ? "bg-muted/50" : undefined}>
              {canDelete && (
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.name}`}
                    className="h-4 w-4 cursor-pointer align-middle accent-primary"
                    checked={selected.has(l.id)}
                    onChange={() => toggleOne(l.id)}
                  />
                </TD>
              )}
              <TD className="font-medium">
                <Link href={`/leads/${l.id}`} className="hover:underline">{l.name}</Link>
              </TD>
              <TD className="text-muted-foreground">{l.phone}</TD>
              <TD>{l.interest ?? "—"}</TD>
              <TD>{formatMYR(l.budgetMin)}{l.budgetMax ? ` – ${formatMYR(l.budgetMax)}` : ""}</TD>
              {/* Unassigned is called out rather than left blank — an empty cell reads
                  as a rendering glitch, and a lead nobody owns needs to be noticed. */}
              <TD className={l.assigneeName ? "" : "text-destructive"}>
                {l.assigneeName ?? "Unassigned"}
              </TD>
              <TD><Badge className={leadStatusTone(l.status)}>{l.status}</Badge></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
