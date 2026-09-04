import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listAssignableAgents } from "@/server/leads/queries";
import { PropertyForm } from "@/components/properties/property-form";

export default async function NewPropertyPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const canAssign = isTeamLeadOrAbove(me);
  const agents = canAssign ? await listAssignableAgents() : [];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">New property</h1>
      <PropertyForm mode="create" agents={agents} canAssign={canAssign} />
    </div>
  );
}
