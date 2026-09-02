import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox, Search, Plus, Upload } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listLeadsPaginated, parseLeadSort, type LeadStatus } from "@/server/leads/queries";
import { listAssignableUsers } from "@/server/users/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { LEAD_STATUS, statusLabel } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsTable } from "@/components/leads/leads-table";
import { PageTitle } from "@/components/ui/page-title";
import { FilterChip } from "@/components/ui/segmented";
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
  const [{ items, total, pageSize }, assignees, projects] = await Promise.all([
    listLeadsPaginated(me, { search: sp.q, status, page, sort }),
    canAssign ? listAssignableUsers() : Promise.resolve([]),
    listProjectOptions(),
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

  /*
   * Built here as plain strings, NOT as a function passed down.
   *
   * A function cannot cross from a Server Component to a Client Component — React has
   * no way to serialise it, and the page throws at render with a digest and nothing
   * else. TypeScript accepts it happily, so the only defence is knowing the rule.
   */
  const sortHrefs: Record<string, string> = {
    name: withParams({ sort: "name" }),
    status: withParams({ sort: "status" }),
    newest: withParams({ sort: "newest" }),
    oldest: withParams({ sort: "oldest" }),
  };

  return (
    <div className="space-y-5">
      <PageTitle
        title="Leads"
        count={total}
        actions={
          <>
            <Link href="/leads/import" className={cn(buttonVariants({ variant: "outline" }))}>
              <Upload className="h-4 w-4" /> Import CSV
            </Link>
            <Link href="/leads/new" className={cn(buttonVariants())}>
              <Plus className="h-4 w-4" /> Add lead
            </Link>
          </>
        }
      >
        {total === 1 ? "lead" : "leads"}
        {status || sp.q ? " matching your filters" : " in your database"}
      </PageTitle>

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
            className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {/* Status as chips rather than a <select>: the current filter is visible without
          opening anything, and clearing it is one click. */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href={withParams({ status: undefined })} label="All" active={!status} />
        {LEAD_STATUS.map((s) => (
          <FilterChip key={s} href={withParams({ status: s })} label={statusLabel(s)} active={status === s} />
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
            utmSource: l.utmSource,
            utmCampaign: l.utmCampaign,
            utmContent: l.utmContent,
            utmTerm: l.utmTerm,
            info: l.info,
            projectId: l.projectId,
            projectName: l.projectName,
            recycleCount: l.recycleCount,
            /*
             * Days since anybody touched this lead, falling back to how long it has
             * existed when nobody ever has. Read from the maintained column rather
             * than re-derived, so it is the same number the follow-up rate uses.
             */
            dormantDays: Math.max(
              0,
              Math.floor(
                (Date.now() - (l.lastFollowUpAt ?? l.createdAt).getTime()) / 86_400_000,
              ),
            ),
          }))}
          // Deletion is admin-only, matching deleteLead: an agent who can erase leads
          // can erase the evidence of ones they never worked.
          canDelete={me.role === "admin"}
          assignees={assignees}
          projects={projects}
          sort={sort}
          sortHrefs={sortHrefs}
        />
      )}

      <p className="text-xs tabular-nums text-muted-foreground">
        {items.length} of {total} {total === 1 ? "lead" : "leads"}
        {status || sp.q ? " · filters applied" : ""}
      </p>

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
