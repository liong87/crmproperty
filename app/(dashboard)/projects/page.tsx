import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import {
  listProjectsPaginated,
  type ProjectStatus,
  type ProjectPropertyType,
} from "@/server/projects/queries";
import { PROJECT_STATUS, PROPERTY_TYPE, MALAYSIAN_STATES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPriceRange } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Landmark } from "lucide-react";
import { projectStatusTone } from "@/lib/status";

const inList = <T extends string>(arr: readonly T[], v: string | undefined): T | undefined =>
  arr.includes((v ?? "") as T) ? (v as T) : undefined;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; propertyType?: string; state?: string; page?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const canEdit = isManagerOrAbove(me);

  const { items, total, pageSize } = await listProjectsPaginated({
    search: sp.q,
    status: inList<ProjectStatus>(PROJECT_STATUS, sp.status),
    propertyType: inList<ProjectPropertyType>(PROPERTY_TYPE, sp.propertyType),
    state: sp.state || undefined,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        {canEdit && <Link href="/projects/new"><Button size="sm">New Project</Button></Link>}
      </div>

      <form className="grid grid-cols-2 gap-2 sm:grid-cols-4" action="/projects">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name or developer" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        <select name="propertyType" defaultValue={sp.propertyType ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any kind</option>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select name="state" defaultValue={sp.state ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any state</option>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any status</option>{PROJECT_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
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
            <EmptyState
              icon={Landmark}
              title="No projects found"
              hint={canEdit ? "Add a project or adjust your filters." : "Adjust your filters, or ask a manager to add a project."}
            />
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/projects?page=${page - 1}`}><Button size="sm" variant="outline">Prev</Button></Link>}
            {page < pages && <Link href={`/projects?page=${page + 1}`}><Button size="sm" variant="outline">Next</Button></Link>}
          </div>
        </div>
      )}
    </div>
  );
}
