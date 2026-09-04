import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import {
  listWorkingLeads, countWorkingTabs, getFollowUpRate, LIST_CAP, type WorkingTab,
} from "@/server/leads/working";
import { WorkingLeadCard } from "@/components/leads/working-lead-card";
import { listAssignableUsers } from "@/server/users/queries";
import { FilterDropdown, ActiveFilterChip, type FilterOption } from "@/components/leads/filter-dropdown";
import { statusLabel } from "@/lib/constants";
import { QueueSearch } from "@/components/leads/queue-search";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Segmented } from "@/components/ui/segmented";
import { buttonVariants } from "@/components/ui/button";
import { STATUS } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export const metadata = { title: "Working Leads" };

/**
 * The daily queue: what I personally have to work, quietest first.
 *
 * Deliberately separate from /leads. That page is the database — every lead, sortable,
 * searchable, for looking somebody up. This one answers "what do I do next", and the
 * two questions want opposite designs: a table for the first, cards with actions for
 * the second.
 */
export default async function WorkingLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string; q?: string;
    product?: string | string[]; status?: string | string[]; wa?: string;
  }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const sp = await searchParams;
  const tab: WorkingTab =
    sp.tab === "inactive" || sp.tab === "appointment" || sp.tab === "co-broke"
      ? sp.tab
      : "active";
  const search = sp.q?.trim() || undefined;
  const asList = (v: string | string[] | undefined): string[] =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  const productSel = asList(sp.product);
  const statusSel = asList(sp.status);
  const waOnly = sp.wa === "1";

  const [rows, counts, rate, staff] = await Promise.all([
    listWorkingLeads(me, tab, { search }),
    countWorkingTabs(me, { search }),
    getFollowUpRate(me, 7),
    listAssignableUsers(),
  ]);

  // Everyone but you. Handing a lead to yourself is not a thing, and offering it as an
  // option is the sort of detail that makes a control feel unfinished.
  const colleagues = staff.filter((u) => u.id !== me.id);

  /*
   * Facets come from the rows the search returned, BEFORE the chips are applied — so
   * every option you can see is one that would actually match something, and picking
   * one never empties the menu you picked it from.
   */
  const facet = (
    pick: (r: (typeof rows)[number]) => { value: string; label: string } | null,
  ): FilterOption[] => {
    const seen = new Map<string, FilterOption>();
    for (const r of rows) {
      const v = pick(r);
      if (!v) continue;
      const found = seen.get(v.value);
      if (found) found.count += 1;
      else seen.set(v.value, { ...v, count: 1 });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  };

  const productOptions = facet((r) =>
    r.projectId && r.projectName ? { value: r.projectId, label: r.projectName } : null,
  );
  const statusOptions = facet((r) => ({ value: r.status, label: statusLabel(r.status) }));

  // AND across chips, OR within one — the only combination anybody means by this UI.
  const items = rows.filter((r) => {
    if (productSel.length > 0 && (!r.projectId || !productSel.includes(r.projectId))) return false;
    if (statusSel.length > 0 && !statusSel.includes(r.status)) return false;
    if (waOnly && !r.phone.replace(/\D/g, "")) return false;
    return true;
  });
  const filtered = productSel.length + statusSel.length + (waOnly ? 1 : 0) > 0 || Boolean(search);
  /** Everything dropped except which tab you are standing on. */
  const clearedHref = tab === "active" ? "/working-leads" : `/working-leads?tab=${tab}`;

  // The WhatsApp opener. A saved per-workspace template is Configuration work (spec
  // §12.6); until that exists this is a sensible default rather than a blank message.
  const waTemplate = `Hi {name}, this is ${me.name.split(" ")[0] ?? me.name} from Lanthorn Realty. `;

  const pctLabel = rate.pct == null ? "—" : `${Math.round(rate.pct * 100)}%`;
  const pctTone =
    rate.pct == null ? undefined
      : rate.pct >= 0.7 ? STATUS.good
      : rate.pct >= 0.4 ? STATUS.warning
      : STATUS.critical;
  /*
   * The verdict in words. The percentage was coloured green/amber/red and nothing else
   * said which of the three it was — the one reading of this tile that matters is
   * invisible in greyscale, and to about one man in twelve in colour.
   */
  const pctVerdict =
    rate.pct == null ? null
      : rate.pct >= 0.7 ? "on top of it"
      : rate.pct >= 0.4 ? "slipping"
      : "behind";

  return (
    <div className="space-y-5">
      <PageTitle
        title="Working leads"
        count={items.length}
        actions={
          /* The follow-up pill. The design system puts one number and a clause in the
             header; this is the second number the product genuinely nags you about. */
          <div className="rounded-2xl border border-gray-100 bg-card px-4 py-2.5 dark:border-gray-800">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Followed up · {rate.days} days
            </p>
            <p className="mt-0.5 text-sm">
              <span
                className="text-lg font-bold tabular-nums"
                style={pctTone ? { color: pctTone } : undefined}
              >
                {pctLabel}
              </span>{" "}
              <span className="tabular-nums text-muted-foreground">
                {rate.followed}/{rate.total} touched
              </span>
              {pctVerdict && <span className="ml-1 text-muted-foreground">· {pctVerdict}</span>}
            </p>
          </div>
        }
      >
        {items.length === 1 ? "lead" : "leads"}{" "}
        {tab === "appointment" ? "with an appointment booked."
          : tab === "inactive" ? "you have closed off."
          : tab === "co-broke" ? "you co-broked with a colleague and still have a share in."
          : "to work on, quietest first."}
        {filtered && " Filters applied."}
      </PageTitle>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          items={[
            { href: "/working-leads", label: "Active", count: counts.active, active: tab === "active" },
            { href: "/working-leads?tab=appointment", label: "Appointment", count: counts.appointment, active: tab === "appointment" },
            { href: "/working-leads?tab=inactive", label: "Inactive", count: counts.inactive, active: tab === "inactive" },
            /* Hidden until there is one. A tab reading "Co-broke 0" on every agent's
               screen from day one teaches everybody to ignore it. */
            ...(counts.handedOver > 0
              ? [{
                  href: "/working-leads?tab=co-broke",
                  label: "Co-broke",
                  count: counts.handedOver,
                  active: tab === "co-broke",
                }]
              : []),
          ]}
        />

        <Suspense fallback={<div className="h-10 min-w-[15rem] flex-1" />}>
          <QueueSearch placeholder="Search name, phone, email, remarks…" />
        </Suspense>
      </div>

      {/*
        Own line, horizontally scrollable, never wraps to two rows.

        Inside Suspense because the chips call useSearchParams: without a boundary Next
        de-opts the entire route to client-side rendering, which on Workers means doing
        the whole page twice.
      */}
      <Suspense fallback={<div className="h-[34px]" />}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterDropdown param="product" label="Product" options={productOptions} />
        {productSel.map((v) => (
          <ActiveFilterChip
            key={v} param="product" value={v}
            label={productOptions.find((o) => o.value === v)?.label ?? v}
          />
        ))}

        <FilterDropdown param="status" label="Status" options={statusOptions} />
        {statusSel.map((v) => (
          <ActiveFilterChip key={v} param="status" value={v} label={statusLabel(v)} />
        ))}

        <FilterDropdown
          param="wa" label="WhatsApp"
          options={[{ value: "1", label: "Has a WhatsApp number", count: rows.filter((r) => r.phone).length }]}
        />
        {waOnly && <ActiveFilterChip param="wa" value="1" label="WhatsApp" />}

        {filtered && (
          /* One control that undoes the lot. Removing chips one at a time is fine while
             you remember what you set; after a search and two chips it is guesswork. */
          <Link
            href={clearedHref}
            className="flex shrink-0 items-center gap-1 rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            Clear filters
          </Link>
        )}
      </div>
      </Suspense>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            filtered ? "No leads match those filters"
              : tab === "active" ? "Nothing to work right now"
              : tab === "appointment" ? "No appointments booked"
              : tab === "co-broke" ? "No co-brokes yet"
              : "Nothing marked dead"
          }
          hint={
            filtered ? "Clear a filter or widen your search — the counts on the tabs above ignore the chips."
              : tab === "active"
              ? "Leads land here when someone assigns them to you, or when one comes in from a campaign you own."
              : tab === "appointment"
                ? "Book one from a lead and it will appear here and on the Appointments board."
                : tab === "co-broke"
                  ? "Co-broke a lead from its card and it stays here, so you can see what became of it."
                  : "Leads marked Not Searching, Unmatched Requirement or Blocked move here, so the active queue stays honest."
          }
          /* An empty state with nothing to press is a dead end: the filtered one hands
             back the unfiltered queue, the genuinely empty one hands over the database,
             which is where the lead you are thinking of actually is. */
          action={
            filtered ? (
              <Link href={clearedHref} className={cn(buttonVariants({ variant: "outline" }))}>
                Clear filters
              </Link>
            ) : (
              <Link href="/leads" className={cn(buttonVariants({ variant: "outline" }))}>
                Open the lead database
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((l) => (
            <WorkingLeadCard key={l.id} lead={l} waTemplate={waTemplate} colleagues={colleagues} />
          ))}
        </div>
      )}

      {items.length >= LIST_CAP && (
        <p className="text-xs text-muted-foreground">
          Showing the {LIST_CAP} quietest leads. Narrow with a filter or search to see
          further down the queue.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Looking for a lead that is not yours, or one you closed off months ago?{" "}
        <Link href="/leads" className="text-primary underline underline-offset-2">
          Leads
        </Link>{" "}
        is the full database.
      </p>
    </div>
  );
}
