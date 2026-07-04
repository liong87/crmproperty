import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listAssignableAgents } from "@/server/leads/queries";
import { LeadForm } from "@/components/leads/lead-form";

export default async function NewLeadPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const canAssign = isManagerOrAbove(me);
  const agents = canAssign ? await listAssignableAgents() : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Lead</h1>
      <LeadForm mode="create" agents={agents} canAssign={canAssign} />
    </div>
  );
}
