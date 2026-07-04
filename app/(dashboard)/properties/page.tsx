import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listPropertiesPaginated, type PropertyStatus, type ListingType, type PropertyType } from "@/server/properties/queries";
import { PROPERTY_STATUS, LISTING_TYPE, PROPERTY_TYPE, MALAYSIAN_STATES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMYR, pricePerSqft } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";
import { propertyStatusTone } from "@/lib/status";

const inList = <T extends string>(arr: readonly T[], v: string | undefined): T | undefined =>
  arr.includes((v ?? "") as T) ? (v as T) : undefined;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; listingType?: string; propertyType?: string; state?: string; page?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;

  const { items, total, pageSize } = await listPropertiesPaginated({
    search: sp.q,
    status: inList<PropertyStatus>(PROPERTY_STATUS, sp.status),
    listingType: inList<ListingType>(LISTING_TYPE, sp.listingType),
    propertyType: inList<PropertyType>(PROPERTY_TYPE, sp.propertyType),
    state: sp.state || undefined,
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Properties</h1>
        <Link href="/properties/new"><Button size="sm">New Property</Button></Link>
      </div>

      <form className="grid grid-cols-2 gap-2 sm:grid-cols-5" action="/properties">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        <select name="listingType" defaultValue={sp.listingType ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any type</option>{LISTING_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select name="propertyType" defaultValue={sp.propertyType ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any kind</option>{PROPERTY_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select name="state" defaultValue={sp.state ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any state</option>{MALAYSIAN_STATES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Any status</option>{PROPERTY_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`}>
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardContent className="space-y-1 pt-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium leading-tight">{p.title}</span>
                  <Badge className={propertyStatusTone(p.status)}>{p.status}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">{p.area}, {p.state} · {p.propertyType} · {p.listingType}</div>
                <div className="text-sm">{p.bedrooms ?? "—"} bd · {p.bathrooms ?? "—"} ba · {p.builtUpSqft ?? "—"} sqft</div>
                <div className="font-semibold">{formatMYR(p.askingPrice)}</div>
                <div className="text-xs text-muted-foreground">{pricePerSqft(p.askingPrice, p.builtUpSqft)} / sqft</div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {items.length === 0 && (
          <div className="col-span-full">
            <EmptyState icon={Building2} title="No properties found" hint="Add a listing or adjust your filters." />
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/properties?page=${page - 1}`}><Button size="sm" variant="outline">Prev</Button></Link>}
            {page < pages && <Link href={`/properties?page=${page + 1}`}><Button size="sm" variant="outline">Next</Button></Link>}
          </div>
        </div>
      )}
    </div>
  );
}
