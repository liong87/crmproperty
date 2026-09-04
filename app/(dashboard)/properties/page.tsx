import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listPropertiesPaginated, type PropertyStatus, type ListingType, type PropertyType } from "@/server/properties/queries";
import { PROPERTY_STATUS, LISTING_TYPE, PROPERTY_TYPE, MALAYSIAN_STATES } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn, formatMYR, pricePerSqft } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Building2 } from "lucide-react";
import { propertyStatusTone } from "@/lib/status";

const inList = <T extends string>(arr: readonly T[], v: string | undefined): T | undefined =>
  arr.includes((v ?? "") as T) ? (v as T) : undefined;

type Params = { q?: string; status?: string; listingType?: string; propertyType?: string; state?: string; page?: string };

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
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
  const filtered = Boolean(sp.q || sp.status || sp.listingType || sp.propertyType || sp.state);

  /*
   * Every pagination link used to be `?page=N` and nothing else, which dropped the
   * search and all four filters — Next served page 2 of the UNFILTERED set while the
   * count beside it still described the filtered one. Rebuild the whole query string
   * from what is currently applied, and let the caller override one key.
   */
  const withParams = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { ...sp, page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/properties${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Properties</h1>
        <Link href="/properties/new"><Button size="sm">New property</Button></Link>
      </div>

      {/*
        The selects sit in a plain GET form with no client JS, so changing one applies
        nothing on its own. Without a submit button the only way to filter was to press
        Enter inside the search box — a keystroke nobody discovers. The button is the
        control; each select also carries a real <label>, which is what the four
        `select-name` failures on this page were.
      */}
      {/* 6 equal columns at 834px left the submit button 14px wider than its track, which
          pushed the whole page sideways. Three columns on a tablet, six only when there
          is room for them. */}
      <form className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" action="/properties">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="filter-q" className="sr-only">Search properties</label>
          <input id="filter-q" name="q" defaultValue={sp.q ?? ""} placeholder="Search" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="filter-listing-type" className="sr-only">Listing type</label>
          <select id="filter-listing-type" name="listingType" defaultValue={sp.listingType ?? ""} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Any type</option>{LISTING_TYPE.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
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
            <option value="">Any status</option>{PROPERTY_STATUS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <Button type="submit" size="sm" variant="outline" className="h-9">Apply filters</Button>
          {filtered && (
            <Link href="/properties" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-9")}>
              Clear
            </Link>
          )}
        </div>
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
            {/* "Nothing matches" and "nothing here yet" want opposite next steps. */}
            {filtered ? (
              <EmptyState
                icon={Building2}
                title="No properties match these filters"
                hint="Widen the search, or clear the filters to see every listing."
                action={
                  <Link href="/properties" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                    Clear filters
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="No listings yet"
                hint="Add the first property and it becomes matchable against every lead's budget and area."
                action={
                  <Link href="/properties/new" className={cn(buttonVariants({ size: "sm" }))}>
                    Add property
                  </Link>
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
