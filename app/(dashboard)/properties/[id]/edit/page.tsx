import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit, isManagerOrAbove } from "@/lib/auth";
import { getPropertyById } from "@/server/properties/queries";
import { listAssignableAgents } from "@/server/leads/queries";
import { PropertyForm } from "@/components/properties/property-form";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const p = await getPropertyById(id);
  if (!p) notFound();
  if (!canEdit(me, p.assignedAgent)) redirect(`/properties/${id}`);

  const canAssign = isManagerOrAbove(me);
  const agents = canAssign ? await listAssignableAgents() : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Edit Property</h1>
      <PropertyForm
        mode="edit"
        propertyId={p.id}
        canAssign={canAssign}
        agents={agents}
        defaults={{
          title: p.title, listingType: p.listingType, propertyType: p.propertyType,
          tenure: p.tenure ?? "", leaseholdExpiry: p.leaseholdExpiry != null ? String(p.leaseholdExpiry) : "",
          bumiLot: p.bumiLot, titleType: p.titleType ?? "", state: p.state, area: p.area,
          address: p.address ?? "",
          builtUpSqft: p.builtUpSqft != null ? String(p.builtUpSqft) : "",
          landSqft: p.landSqft != null ? String(p.landSqft) : "",
          bedrooms: p.bedrooms != null ? String(p.bedrooms) : "",
          bathrooms: p.bathrooms != null ? String(p.bathrooms) : "",
          carParks: p.carParks != null ? String(p.carParks) : "",
          askingPriceRM: String(p.askingPrice / 100),
          furnishing: p.furnishing ?? "", status: p.status,
          ownerName: p.ownerName ?? "", ownerPhone: p.ownerPhone ?? "",
          assignedAgent: p.assignedAgent ?? "",
        }}
      />
    </div>
  );
}
