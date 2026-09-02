import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listAssignableAgents } from "@/server/leads/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { LeadForm } from "@/components/leads/lead-form";

export default async function NewLeadPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const canAssign = isTeamLeadOrAbove(me);
  const agents = canAssign ? await listAssignableAgents() : [];
  const projects = await listProjectOptions();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">New Lead</h1>
      <LeadForm mode="create" agents={agents} canAssign={canAssign} projects={projects} />
    </div>
  );
}
