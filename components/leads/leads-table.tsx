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
 *
 * Thirteen columns do not fit a laptop, so two of them are pinned and the rest give
 * way below `lg`. Pinning is what makes the sideways scroll usable: the lead's name
 * stays on the left so you never lose track of whose row you are reading, and the row
 * actions stay on the right so Edit is never six columns off-screen.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FormAlert, LiveStatus } from "@/components/ui/alert";
import { formatMYR, cn } from "@/lib/utils";
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
  /** Set only on a co-broked lead: the agent who sourced it and shares the commission. */
  setterId: string | null;
  setterName: string | null;
  status: string;
  createdAt: Date;
}

const dayFmt = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur",
});
const timeFmt = new Intl.DateTimeFormat("en-MY", {
  hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur",
});

/**
 * Columns that carry less than they cost on a narrow screen. The class goes on the
 * header AND the cell — put it on one of the two and the whole table shears.
 */
const SECONDARY = "hidden lg:table-cell";

/**
 * A pinned cell needs its own OPAQUE background or the rows scroll through it, and it
 * has to follow the row's state or a selected row loses its tint in exactly the two
 * columns that never move. `cn` is tailwind-merge, so the later class wins outright
 * rather than racing the earlier one in the stylesheet.
 */
const pinBg = (selected: boolean) => cn("bg-card group-hover:bg-muted", selected && "bg-muted");

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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  const pageIds = React.useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  // The name column sits behind the checkbox when there is one, so it pins to that
  // column's width (w-10) rather than to 0.
  const nameLeft = canDelete ? "left-10" : "left-0";

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pageIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Row-level failures surface HERE rather than inside the pinned actions cell:
          that cell is 6rem wide, and a sentence in it is unreadable. */}
      {error && <FormAlert>{error}</FormAlert>}

      <LiveStatus>{selected.size > 0 ? `${selected.size} selected` : "Nothing selected"}</LiveStatus>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-card dark:border-gray-800">
      {/*
        A bounded height is what makes the sticky header actually stick: the scroll
        region owns `overflow`, and CSS cannot scroll one axis while leaving the other
        visible — so without a max-height `thead` has nothing to stick inside. Desktop
        only; on a phone the page scroll is the right model and the table is short.
      */}
      <Table label="Leads" containerClassName="sm:max-h-[calc(100dvh-16rem)]">
        <THead sticky>
          <TR>
            {canDelete && (
              <TH className="sticky left-0 z-10 w-10">
                <input
                  type="checkbox"
                  aria-label="Select all leads on this page"
                  // A half-filled box otherwise reads as plain "checked": indeterminate
                  // is a DOM property and carries no ARIA of its own.
                  aria-checked={someSelected ? "mixed" : allSelected}
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
            <SortTH
              label="Lead"
              sortKey="name"
              sort={sort}
              hrefs={sortHrefs}
              className={cn("sticky z-10 border-r", nameLeft)}
            />
            <TH className={SECONDARY}>Source</TH>
            <TH className={SECONDARY}>Info</TH>
            <TH>Product</TH>
            <TH className={SECONDARY}>Interest</TH>
            <TH className={SECONDARY}>Budget</TH>
            <TH>Assigned to</TH>
            <SortTH label="Status" sortKey="status" sort={sort} hrefs={sortHrefs} />
            <SortTH label="Added" sortKey="newest" sort={sort} hrefs={sortHrefs} />
            {/* Two narrow columns that between them say which leads are being
                neglected and which are being shuffled without progress. The glyph is
                decoration: `title` is not an accessible name, so the name is real text. */}
            <TH className={cn("text-center", SECONDARY)}>
              <span aria-hidden="true">&#8635;</span>
              <span className="sr-only">Times reassigned</span>
            </TH>
            <TH className={cn("text-center", SECONDARY)}>
              <span aria-hidden="true">D</span>
              <span className="sr-only">Days since the last touch</span>
            </TH>
            {/* Pinned right. These were the most important controls on the row and
                the furthest off-screen — you had to scroll sideways past six columns
                to reach Edit, which is why nobody found them. */}
            <TH className="sticky right-0 z-10 w-24 border-l">
              <span className="sr-only">Row actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((l) => {
            const isSelected = selected.has(l.id);
            const budget = `${formatMYR(l.budgetMin)}${l.budgetMax ? ` – ${formatMYR(l.budgetMax)}` : ""}`;
            return (
              <TR key={l.id} className={cn("group", isSelected && "bg-muted/50")}>
                {canDelete && (
                  <TD className={cn("sticky left-0 z-10", pinBg(isSelected))}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${l.name}`}
                      className="h-4 w-4 cursor-pointer align-middle accent-primary"
                      checked={isSelected}
                      onChange={() => toggleOne(l.id)}
                    />
                  </TD>
                )}
                {/* Name and phone stacked in one cell: they are read together, and two
                    columns for one identity wastes the width the table actually needs. */}
                <TD className={cn("sticky z-10 w-44 min-w-[11rem] border-r", nameLeft, pinBg(isSelected))}>
                  <Link href={`/leads/${l.id}`} className="block font-medium hover:underline">
                    {l.name}
                  </Link>
                  <span className="block text-xs tabular-nums text-muted-foreground">{l.phone}</span>
                </TD>
                <TD className={SECONDARY}>
                  <span className="block text-sm">{sourceLabel(l.source, l.utmSource, l.sourceDetail)}</span>
                  {l.sourceDetail && (
                    <span
                      title={l.sourceDetail}
                      className="block max-w-[14rem] truncate text-xs text-muted-foreground"
                    >
                      {l.sourceDetail}
                    </span>
                  )}
                </TD>
                <TD className={cn("max-w-[12rem]", SECONDARY)}>
                  {l.info
                    ? <span title={l.info} className="line-clamp-1 text-xs text-muted-foreground">{l.info}</span>
                    : <span className="text-muted-foreground">—</span>}
                </TD>
                <TD>
                  {l.projectName
                    ? <Badge variant="secondary">{l.projectName}</Badge>
                    : <span className="text-muted-foreground">—</span>}
                </TD>
                <TD className={cn("capitalize", SECONDARY)}>{l.interest ?? "—"}</TD>
                {/* Ringgit only lines up column-to-column in tabular figures, and a
                    wrapped range reads as two unrelated numbers. */}
                <TD className={cn("max-w-[11rem] tabular-nums", SECONDARY)} title={budget}>
                  {budget}
                </TD>
                {/* Unassigned is called out rather than left blank — an empty cell reads
                    as a rendering glitch, and a lead nobody owns needs to be noticed. */}
                <TD className={canAssign ? "p-1" : l.assigneeName ? "" : "text-destructive-ink"}>
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
                  {/* A co-broked lead looks identical to a reassigned one without
                      this line, and the difference is who gets paid. */}
                  {l.setterId && (
                    <span className="mt-0.5 block whitespace-nowrap text-xs text-muted-foreground">
                      Co-broke · setter {who(l.setterName, l.setterId, meId)}
                    </span>
                  )}
                </TD>
                <TD>
                  <StatusCell leadId={l.id} leadName={l.name} status={l.status} />
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  <span className="block">{dayFmt.format(l.createdAt)}</span>
                  <span className="block tabular-nums opacity-70">{timeFmt.format(l.createdAt)}</span>
                </TD>
                <TD className={cn("text-center text-xs tabular-nums text-muted-foreground", SECONDARY)}>
                  {l.recycleCount > 0 ? `↻ ${l.recycleCount}×` : "—"}
                </TD>
                <TD className={cn("text-center text-xs tabular-nums text-muted-foreground", SECONDARY)}>
                  {l.dormantDays}d
                </TD>
                <TD className={cn("sticky right-0 z-10 border-l", pinBg(isSelected))}>
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
                    onError={setError}
                  />
                </TD>
              </TR>
            );
          })}
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
        onClear={() => setSelected(new Set())}
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
  label, sortKey, sort, hrefs, className,
}: {
  label: string;
  sortKey: string;
  sort?: string;
  hrefs?: Record<string, string>;
  className?: string;
}) {
  if (!hrefs) return <TH className={className}>{label}</TH>;
  // "Added" toggles between newest and oldest; the others are one direction, because a
  // reverse-alphabetical lead list is not a thing anybody wants.
  const target = sortKey === "newest" ? (sort === "newest" ? "oldest" : "newest") : sortKey;
  const active = sort === sortKey || (sortKey === "newest" && sort === "oldest");
  const to = hrefs[target];
  if (!to) return <TH className={className}>{label}</TH>;
  // Newest-first is the only descending order in the table; everything else sorts up.
  const descending = sortKey === "newest" && sort === "newest";
  const Arrow = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
  return (
    <TH
      aria-sort={active ? (descending ? "descending" : "ascending") : "none"}
      className={cn("p-0", className)}
    >
      <Link
        href={to}
        className="flex h-10 items-center gap-1 px-3 transition-colors hover:text-foreground"
      >
        {label}
        {/* The direction has to be in the SHAPE. The old arrow only changed opacity,
            which says "this column is sorted" and nothing about which way. */}
        <Arrow aria-hidden="true" className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")} />
      </Link>
    </TH>
  );
}
