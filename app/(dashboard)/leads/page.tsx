import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Search, Plus, Upload } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listLeadsPaginated, parseLeadSort, type LeadStatus } from "@/server/leads/queries";
import { listAssignableUsers } from "@/server/users/queries";
import { LEAD_STATUS } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsTable } from "@/components/leads/leads-table";
import { cn } from "@/lib/utils";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string; sort?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const status = (LEAD_STATUS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as LeadStatus)
    : undefined;
  const page = Number(sp.page ?? "1") || 1;
  const sort = parseLeadSort(sp.sort);

  /*
   * The assignee list is fetched only for someone who may reassign. An agent's browser
   * therefore never receives the roster of their colleagues — the permission check and
   * the data boundary are the same line.
   */
  const canAssign = me.role !== "agent";
  const [{ items, total, pageSize }, assignees] = await Promise.all([
    listLeadsPaginated(me, { search: sp.q, status, page, sort }),
    canAssign ? listAssignableUsers() : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  /** Keep every filter when one of them changes — losing a search on sort is maddening. */
  const withParams = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, status: sp.status, sort: sp.sort, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/leads${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{total}</span>{" "}
            {total === 1 ? "lead" : "leads"}
            {status || sp.q ? " matching your filters" : " in your database"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/leads/import" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Import CSV
          </Link>
          <Link href="/leads/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus className="mr-1.5 h-4 w-4" /> New lead
          </Link>
        </div>
      </div>

      {/* Search stays a plain form: it works without JavaScript and survives a reload. */}
      <form action="/leads" className="flex flex-wrap items-center gap-2">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        {sp.sort && <input type="hidden" name="sort" value={sp.sort} />}
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name, phone, email…"
            className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">Search</Button>
      </form>

      {/* Status as chips rather than a <select>: the current filter is visible without
          opening anything, and clearing it is one click. */}
      <div className="flex flex-wrap gap-1.5">
        <Chip href={withParams({ status: undefined })} label="All" active={!status} />
        {LEAD_STATUS.map((s) => (
          <Chip key={s} href={withParams({ status: s })} label={s} active={status === s} />
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No leads found"
          hint="Capture a new lead or adjust your filters."
        />
      ) : (
        <LeadsTable
          rows={items.map((l) => ({
            id: l.id,
            name: l.name,
            phone: l.phone,
            email: l.email,
            source: l.source,
            sourceDetail: l.sourceDetail,
            interest: l.interest,
            budgetMin: l.budgetMin,
            budgetMax: l.budgetMax,
            assigneeName: l.assigneeName,
            assignedTo: l.assignedTo,
            status: l.status,
            createdAt: l.createdAt,
          }))}
          // Deletion is admin-only, matching deleteLead: an agent who can erase leads
          // can erase the evidence of ones they never worked.
          canDelete={me.role === "admin"}
          assignees={assignees}
          sort={sort}
          sortHref={(s) => withParams({ sort: s })}
        />
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={withParams({ page: String(page - 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={withParams({ page: String(page + 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
