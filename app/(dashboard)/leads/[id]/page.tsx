import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit } from "@/lib/auth";
import { getLeadById } from "@/server/leads/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QualifyButton } from "@/components/leads/qualify-button";
import { ActivitySection } from "@/components/activities/activity-section";
import { WhatsAppButton } from "@/components/activities/whatsapp-button";
import { formatMYR } from "@/lib/utils";
import { leadStatusTone } from "@/lib/status";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();

  const editable = canEdit(me, lead.assignedTo) && !lead.convertedToContactId;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{lead.name}</h1>
          <Badge className={leadStatusTone(lead.status)}>{lead.status}</Badge>
        </div>
        {editable && <Link href={`/leads/${lead.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
      </div>

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Phone" value={lead.phone} />
          <Field label="Email" value={lead.email ?? "—"} />
          <Field label="Interest" value={lead.interest ?? "—"} />
          <Field label="Budget" value={`${formatMYR(lead.budgetMin)}${lead.budgetMax ? ` – ${formatMYR(lead.budgetMax)}` : ""}`} />
          <Field label="Preferred areas" value={lead.preferredAreas ?? "—"} />
          <Field label="Source" value={`${lead.source}${lead.sourceDetail ? ` (${lead.sourceDetail})` : ""}`} />
          <Field label="Consent" value={lead.consentGivenAt ? `Given (${lead.consentSource ?? "n/a"})` : "Not recorded"} />
        </CardContent>
      </Card>

      {lead.convertedToContactId ? (
        <Card>
          <CardContent className="pt-4 text-sm">
            This lead was qualified.{" "}
            <Link href={`/contacts/${lead.convertedToContactId}`} className="font-medium underline">
              View contact →
            </Link>
          </CardContent>
        </Card>
      ) : editable ? (
        <QualifyButton leadId={lead.id} />
      ) : null}

      {editable && <WhatsAppButton entityType="leads" entityId={lead.id} toPhone={lead.phone} defaultMessage={`Hi ${lead.name}, `} />}

      <ActivitySection entityType="leads" entityId={lead.id} canLog={canEdit(me, lead.assignedTo)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
