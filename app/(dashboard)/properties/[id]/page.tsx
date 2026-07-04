import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit } from "@/lib/auth";
import { getPropertyById } from "@/server/properties/queries";
import { listPropertyImages } from "@/server/properties/images";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageManager } from "@/components/properties/image-manager";
import { StatusControl } from "@/components/properties/status-control";
import { DeletePropertyButton } from "@/components/properties/delete-button";
import { ActivitySection } from "@/components/activities/activity-section";
import { formatMYR, pricePerSqft } from "@/lib/utils";
import { propertyStatusTone } from "@/lib/status";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const p = await getPropertyById(id);
  if (!p) notFound();
  const editable = canEdit(me, p.assignedAgent);
  const images = await listPropertyImages(p.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{p.title}</h1>
          <p className="text-sm text-muted-foreground">{p.area}, {p.state}</p>
        </div>
        <div className="flex items-center gap-2">
          {editable ? <StatusControl propertyId={p.id} status={p.status} /> : <Badge className={propertyStatusTone(p.status)}>{p.status}</Badge>}
          {editable && <Link href={`/properties/${p.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
          {editable && <DeletePropertyButton propertyId={p.id} />}
        </div>
      </div>

      {images[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={images[0].url} alt={p.title} className="h-56 w-full rounded-xl border object-cover" />
      )}

      <Card>
        <CardHeader><CardTitle>Photos</CardTitle></CardHeader>
        <CardContent><ImageManager propertyId={p.id} images={images} canEdit={editable} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <F label="Price" value={formatMYR(p.askingPrice)} />
          <F label="Price / sqft" value={pricePerSqft(p.askingPrice, p.builtUpSqft)} />
          <F label="Listing" value={p.listingType} />
          <F label="Type" value={p.propertyType} />
          <F label="Built-up" value={p.builtUpSqft ? `${p.builtUpSqft} sqft` : "—"} />
          <F label="Land" value={p.landSqft ? `${p.landSqft} sqft` : "—"} />
          <F label="Beds" value={String(p.bedrooms ?? "—")} />
          <F label="Baths" value={String(p.bathrooms ?? "—")} />
          <F label="Car parks" value={String(p.carParks ?? "—")} />
          <F label="Tenure" value={p.tenure ?? "—"} />
          <F label="Title" value={p.titleType ?? "—"} />
          <F label="Furnishing" value={p.furnishing ?? "—"} />
          <F label="Bumi lot" value={p.bumiLot ? "Yes" : "No"} />
          <F label="Owner" value={p.ownerName ?? "—"} />
          <F label="Owner phone" value={p.ownerPhone ?? "—"} />
        </CardContent>
      </Card>
      {p.address && (
        <Card><CardHeader><CardTitle>Address</CardTitle></CardHeader><CardContent className="text-sm">{p.address}</CardContent></Card>
      )}

      <ActivitySection entityType="properties" entityId={p.id} canLog={editable} />
    </div>
  );
}

function F({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div>{value}</div></div>;
}
