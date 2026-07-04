import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit, isManagerOrAbove } from "@/lib/auth";
import { getLeadById, listAssignableAgents } from "@/server/leads/queries";
import { LeadForm } from "@/components/leads/lead-form";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();
  if (!canEdit(me, lead.assignedTo) || lead.convertedToContactId) redirect(`/leads/${id}`);

  const canAssign = isManagerOrAbove(me);
  const agents = canAssign ? await listAssignableAgents() : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit Lead</h1>
      <LeadForm
        mode="edit"
        leadId={lead.id}
        canAssign={canAssign}
        agents={agents}
        defaults={{
          name: lead.name,
          phone: lead.phone,
          email: lead.email ?? "",
          interest: (lead.interest as never) ?? "",
          budgetMinRM: lead.budgetMin != null ? String(lead.budgetMin / 100) : "",
          budgetMaxRM: lead.budgetMax != null ? String(lead.budgetMax / 100) : "",
          preferredAreas: lead.preferredAreas ?? "",
          assignedTo: lead.assignedTo ?? "",
        }}
      />
    </div>
  );
}
