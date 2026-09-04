import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import {
  listProjectsPaginated,
  type ProjectStatus,
  type ProjectPropertyType,
} from "@/server/projects/queries";
import { PROJECT_STATUS, PROPERTY_TYPE, MALAYSIAN_STATES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatPriceRange } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Landmark } from "lucide-react";
import { projectStatusTone } from "@/lib/status";

const inList = <T extends string>(arr: readonly T[], v: string | undefined): T | undefined =>
  arr.includes((v ?? "") as T) ? (v as T) : undefined;

type Params = { q?: string; status?: string; propertyType?: string; state?: string; page?: string };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const canEdit = isTeamLeadOrAbove(me);

  const { items, total, pageSize } = await listProjectsPaginated({
    search: sp.q,
    status: inList<ProjectStatus>(PROJECT_STATUS, sp.status),
    propertyType: inList<ProjectPropertyType>(PROPERTY_TYPE, sp.propertyType),
    state: sp.state || undefined,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const filtered = Boolean(sp.q || sp.status || sp.propertyType || sp.state);

  /** Keep the search and filters across a page change — see the same helper on properties. */
  const withParams = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { ...sp, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/projects${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Projects</h1>
        {canEdit && <Link href="/projects/new"><Button size="sm">New project</Button></Link>}
      </div>

      {/* Named selects and an explicit submit: changing a select in a plain GET form
          applies nothing by itself. */}
      <form className="grid grid-cols-2 gap-2 sm:grid-cols-5" action="/projects">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="filter-q" className="sr-only">Search projects</label>
          <input id="filter-q" name="q" defaultValue={sp.q ?? ""} placeholder="Search name or developer" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="filter-property-type" className="sr-only">Property type</label>
          <select id="filter-property-type" name="propertyType" defaultValue={sp.propertyType ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Any kind</option>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-state" className="sr-only">State</label>
          <select id="filter-state" name="state" defaultValue={sp.state ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Any state</option>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-status" className="sr-only">Status</label>
          <select id="filter-status" name="status" defaultValue={sp.status ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Any status</option>{PROJECT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <Button type="submit" size="sm" variant="outline" className="h-9">Apply filters</Button>
          {filtered && (
            <Link href="/projects" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9")}>
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="space-y-1 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{p.name}</span>
                  <Badge className={projectStatusTone(p.status)}>{p.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {p.developer ? `${p.developer} · ` : ""}{p.area}, {p.state}
                </div>
                <div className="font-semibold">{formatPriceRange(p.priceFrom, p.priceTo)}</div>
                <div className="text-xs text-muted-foreground">
                  {p.unitTypeCount === 0
                    ? "No unit types yet"
                    : `${p.unitTypeCount} unit type${p.unitTypeCount === 1 ? "" : "s"}`}
                  {p.totalUnits != null && ` · ${p.totalUnits} units`}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="col-span-full">
            {filtered ? (
              <EmptyState
                icon={Landmark}
                title="No projects match these filters"
                hint="Widen the search, or clear the filters to see every project."
                action={
                  <Link href="/projects" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Landmark}
                title="No projects yet"
                hint={
                  canEdit
                    ? "Add a launch and its unit types become what every agent quotes from."
                    : "Ask a team lead to add the launches your agency is selling."
                }
                action={
                  canEdit ? (
                    <Link href="/projects/new" className={cn(buttonVariants({ size: "sm" }))}>
                      Add project
                    </Link>
                  ) : undefined
                }
              />
            )}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={withParams({ page: String(page - 1) })} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                Prev
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
