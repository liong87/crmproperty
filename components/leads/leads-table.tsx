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
import { ArrowUpDown } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMYR, cn } from "@/lib/utils";
import { leadStatusTone } from "@/lib/status";
import { statusLabel } from "@/lib/constants";
import { deleteLeads } from "@/server/leads/actions";
import { AssignCell } from "./assign-cell";
import type { AssignableUser } from "@/server/users/queries";

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  sourceDetail: string | null;
  interest: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  assigneeName: string | null;
  assignedTo: string | null;
  status: string;
  createdAt: Date;
}

const dayFmt = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur",
});

export function LeadsTable({
  rows,
  canDelete,
  assignees = [],
  sort,
  sortHrefs,
}: {
  rows: LeadRow[];
  /** Admin only. Without it this renders exactly as the table did before. */
  canDelete: boolean;
  /**
   * Active users a lead can be handed to. Empty for an agent, who cannot reassign —
   * and because it is empty, the list of colleagues is never sent to their browser.
   */
  assignees?: AssignableUser[];
  sort?: string;
  /**
   * Prebuilt links, one per sort order, so the search and status filters survive a
   * sort. A plain object rather than a builder function: functions cannot be passed
   * from a Server Component to a Client Component.
   */
  sortHrefs?: Record<string, string>;
}) {
  const canAssign = assignees.length > 0;
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [armed, setArmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // A partial delete succeeded — it is not an error and should not be red.
  const [notice, setNotice] = React.useState<string | null>(null);
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
    setNotice(null);
    start(async () => {
      const res = await deleteLeads([...selected]);
      if (!res.success) {
        setError(res.error);
        setArmed(false);
        return;
      }
      setNotice(
        res.data.skipped > 0
          ? `Deleted ${res.data.deleted}. Skipped ${res.data.skipped} that became contacts — delete those from Contacts.`
          : `Deleted ${res.data.deleted}.`,
      );
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

      {notice && (
        <p className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
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
            <SortTH label="Lead" sortKey="name" sort={sort} hrefs={sortHrefs} />
            <TH>Source</TH>
            <TH>Interest</TH>
            <TH>Budget</TH>
            <TH>Assigned to</TH>
            <SortTH label="Status" sortKey="status" sort={sort} hrefs={sortHrefs} />
            <SortTH label="Added" sortKey="newest" sort={sort} hrefs={sortHrefs} />
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
              {/* Name and phone stacked in one cell: they are read together, and two
                  columns for one identity wastes the width the table actually needs. */}
              <TD>
                <Link href={`/leads/${l.id}`} className="block font-medium hover:underline">
                  {l.name}
                </Link>
                <span className="block text-xs tabular-nums text-muted-foreground">{l.phone}</span>
              </TD>
              <TD>
                <span className="block text-sm capitalize">{l.source}</span>
                {l.sourceDetail && (
                  <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                    {l.sourceDetail}
                  </span>
                )}
              </TD>
              <TD className="capitalize">{l.interest ?? "—"}</TD>
              <TD>{formatMYR(l.budgetMin)}{l.budgetMax ? ` – ${formatMYR(l.budgetMax)}` : ""}</TD>
              {/* Unassigned is called out rather than left blank — an empty cell reads
                  as a rendering glitch, and a lead nobody owns needs to be noticed. */}
              <TD className={canAssign ? "p-1" : l.assigneeName ? "" : "text-destructive"}>
                {canAssign ? (
                  <AssignCell
                    leadId={l.id}
                    currentName={l.assigneeName}
                    currentId={l.assignedTo}
                    users={assignees}
                  />
                ) : (
                  l.assigneeName ?? "Unassigned"
                )}
              </TD>
              <TD><Badge className={leadStatusTone(l.status)}>{statusLabel(l.status)}</Badge></TD>
              <TD className="whitespace-nowrap text-xs text-muted-foreground">
                {dayFmt.format(l.createdAt)}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      </div>
    </div>
  );
}

/**
 * A sortable column heading.
 *
 * Renders as plain text when the page did not supply a link builder, so the table still
 * works anywhere it is reused without sorting.
 */
function SortTH({
  label, sortKey, sort, hrefs,
}: {
  label: string;
  sortKey: string;
  sort?: string;
  hrefs?: Record<string, string>;
}) {
  if (!hrefs) return <TH>{label}</TH>;
  // "Added" toggles between newest and oldest; the others are one direction, because a
  // reverse-alphabetical lead list is not a thing anybody wants.
  const target = sortKey === "newest" ? (sort === "newest" ? "oldest" : "newest") : sortKey;
  const active = sort === sortKey || (sortKey === "newest" && sort === "oldest");
  const to = hrefs[target];
  if (!to) return <TH>{label}</TH>;
  return (
    <TH className="p-0">
      <Link
        href={to}
        className="flex h-10 items-center gap-1 px-3 transition-colors hover:text-foreground"
      >
        {label}
        <ArrowUpDown className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")} />
      </Link>
    </TH>
  );
}
