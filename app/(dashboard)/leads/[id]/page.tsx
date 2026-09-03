import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canView, isAdmin } from "@/lib/auth";
import { getLeadById } from "@/server/leads/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QualifyButton } from "@/components/leads/qualify-button";
import { DeleteLeadButton } from "@/components/leads/delete-button";
import { ActivitySection } from "@/components/activities/activity-section";
import { WhatsAppButton } from "@/components/activities/whatsapp-button";
import { MatchingListings } from "@/components/matching/match-panels";
import { listActiveTemplates } from "@/server/templates/actions";
import { listPickableListings } from "@/server/matching/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { listAssignableAgents } from "@/server/leads/queries";
import { listAppointmentsForClient } from "@/server/appointments/queries";
import { ScheduleAppointment } from "@/components/appointments/schedule-appointment";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { APP_NAME } from "@/lib/constants";
import { formatMYR, formatCampaignTrail } from "@/lib/utils";
import { leadStatusTone } from "@/lib/status";
import { canEditOwned } from "@/server/auth/ownership";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const lead = await getLeadById(id);
  if (!lead) notFound();
  // See contacts/[id]/page.tsx - read access needs its own check.
  if (!canView(me, lead.assignedTo)) notFound();

  const editable = await canEditOwned(me, lead.assignedTo) && !lead.convertedToContactId;
  // Null when the lead came from a source with no ad behind it — walk-ins, referrals,
  // a hand-typed enquiry — in which case the field is not rendered at all.
  const campaignTrail = formatCampaignTrail(lead.utmCampaign, lead.utmContent, lead.utmTerm);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{lead.name}</h1>
          <Badge className={leadStatusTone(lead.status)}>{lead.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {editable && <Link href={`/leads/${lead.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
          {/* Admin only: disqualifying already clears a lead from everyday view, so
              deletion is for junk that should not exist — spam, duplicates, tests. */}
          {isAdmin(me) && !lead.convertedToContactId && <DeleteLeadButton leadId={lead.id} />}
        </div>
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
          {campaignTrail && <Field label="Campaign" value={campaignTrail} />}
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

      {editable && (
        <WhatsAppButton
          entityType="leads"
          entityId={lead.id}
          toPhone={lead.phone}
          defaultMessage={`Hi ${lead.name.split(" ")[0] ?? lead.name}, `}
          templates={await listActiveTemplates("whatsapp")}
          listings={await listPickableListings()}
          values={{
            name: lead.name.split(" ")[0] ?? lead.name,
            fullName: lead.name,
            agent: me.name,
            agency: APP_NAME,
            area: lead.preferredAreas,
          }}
        />
      )}

      {editable && (
        <Card>
          <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AppointmentList
              items={await listAppointmentsForClient(me, { leadId: lead.id })}
              empty="No appointments yet."
            />
            <ScheduleAppointment
              leadId={lead.id}
              listings={await listPickableListings()}
              projects={await listProjectOptions()}
              agents={(await listAssignableAgents()).filter((a) => a.id !== me.id)}
            />
          </CardContent>
        </Card>
      )}

      {/* Listings this enquiry could be shown. A concrete match is the strongest
          reason to call a lead back, so it sits above the activity log. */}
      <MatchingListings
        criteria={{
          interest: lead.interest,
          budgetMin: lead.budgetMin,
          budgetMax: lead.budgetMax,
          preferredAreas: lead.preferredAreas,
        }}
        who={lead.name.split(" ")[0] ?? "this lead"}
      />

      <ActivitySection entityType="leads" entityId={lead.id} canLog={await canEditOwned(me, lead.assignedTo)} />
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
