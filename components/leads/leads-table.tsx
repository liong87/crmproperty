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
import { who } from "@/lib/user-name";
import { useMeId } from "@/lib/me-context";
import { AssignCell } from "./assign-cell";
import { LeadRowActions } from "./row-actions";
import { StatusCell } from "./status-cell";
import { BulkBar } from "./bulk-bar";
import { sourceLabel } from "@/lib/leads/source-label";
import type { AssignableUser } from "@/server/users/queries";

export interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  sourceDetail: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  info: string | null;
  projectId: string | null;
  projectName: string | null;
  /** Times reassigned, and days since the last touch — the two neglect signals. */
  recycleCount: number;
  dormantDays: number;
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
const timeFmt = new Intl.DateTimeFormat("en-MY", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur",
});

export function LeadsTable({
  rows,
  canDelete,
  assignees = [],
  sort,
  sortHrefs,
  projects = [],
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
  /** Products for the edit modal. Empty for an agent, who cannot reassign a product. */
  projects?: { id: string; name: string }[];
}) {
  const canAssign = assignees.length > 0;
  const meId = useMeId();
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



  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}


      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card dark:border-gray-800">
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
            <TH>Info</TH>
            <TH>Product</TH>
            <TH>Interest</TH>
            <TH>Budget</TH>
            <TH>Assigned to</TH>
            <SortTH label="Status" sortKey="status" sort={sort} hrefs={sortHrefs} />
            <SortTH label="Added" sortKey="newest" sort={sort} hrefs={sortHrefs} />
            {/* Two narrow columns that between them say which leads are being
                neglected and which are being shuffled without progress. */}
            <TH className="text-center" title="Times reassigned">&#8635;</TH>
            <TH className="text-center" title="Days since the last touch">D</TH>
            {/* Pinned right. These were the most important controls on the row and
                the furthest off-screen — you had to scroll sideways past six columns
                to reach Edit, which is why nobody found them. */}
            <TH className="sticky right-0 w-24 bg-card" />
          </TR>
        </THead>
        <TBody>
          {rows.map((l) => (
            <TR key={l.id} className={cn("group", selected.has(l.id) && "bg-muted/50")}>
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
                <span className="block text-sm">{sourceLabel(l.source, l.utmSource, l.sourceDetail)}</span>
                {l.sourceDetail && (
                  <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                    {l.sourceDetail}
                  </span>
                )}
              </TD>
              <TD className="max-w-[12rem]">
                {l.info
                  ? <span className="line-clamp-1 text-xs text-muted-foreground">{l.info}</span>
                  : <span className="text-muted-foreground">—</span>}
              </TD>
              <TD>
                {l.projectName
                  ? <Badge variant="secondary">{l.projectName}</Badge>
                  : <span className="text-muted-foreground">—</span>}
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
                  who(l.assigneeName, l.assignedTo, meId)
                )}
              </TD>
              <TD>
                <StatusCell leadId={l.id} leadName={l.name} status={l.status} />
              </TD>
              <TD className="whitespace-nowrap text-xs text-muted-foreground">
                <span className="block">{dayFmt.format(l.createdAt)}</span>
                <span className="block tabular-nums opacity-70">{timeFmt.format(l.createdAt)}</span>
              </TD>
              <TD className="text-center text-xs tabular-nums text-muted-foreground">
                {l.recycleCount > 0 ? `↻ ${l.recycleCount}×` : "—"}
              </TD>
              <TD className="text-center text-xs tabular-nums text-muted-foreground">
                {l.dormantDays}d
              </TD>
              <TD className="sticky right-0 bg-card group-hover:bg-muted/50">
                <LeadRowActions
                  lead={{
                    id: l.id, name: l.name, phone: l.phone, email: l.email,
                    source: l.source, sourceDetail: l.sourceDetail,
                    utmCampaign: l.utmCampaign, utmContent: l.utmContent, utmTerm: l.utmTerm,
                    interest: l.interest, budgetMin: l.budgetMin, budgetMax: l.budgetMax,
                    projectId: l.projectId, info: l.info, createdAt: l.createdAt,
                  }}
                  projects={projects}
                  canDelete={canDelete}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      </div>

      <BulkBar
        selected={[...selected]}
        rows={rows.map((r) => ({
          id: r.id, name: r.name, phone: r.phone, email: r.email,
          status: r.status, projectName: r.projectName, createdAt: r.createdAt,
        }))}
        assignees={assignees}
        projects={projects}
        canDelete={canDelete}
        onClear={() => { setSelected(new Set()); setArmed(false); }}
      />
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
