import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canView } from "@/lib/auth";
import { getContactById } from "@/server/contacts/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateDealButton } from "@/components/deals/create-deal-button";
import { ActivitySection } from "@/components/activities/activity-section";
import { WhatsAppButton } from "@/components/activities/whatsapp-button";
import { MatchingListings } from "@/components/matching/match-panels";
import { listActiveTemplates } from "@/server/templates/actions";
import { listPickableListings } from "@/server/matching/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { listAssignableAgents, getLeadProjectId } from "@/server/leads/queries";
import { listAppointmentsForClient } from "@/server/appointments/queries";
import { ScheduleAppointment } from "@/components/appointments/schedule-appointment";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { APP_NAME } from "@/lib/constants";
import { PdpaPanel } from "@/components/pdpa/pdpa-panel";
import { isAdmin } from "@/lib/auth";
import { formatMYR } from "@/lib/utils";
import { canEditOwned } from "@/server/auth/ownership";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();
  // Read access must be checked, not just edit access. Without this an agent could
  // open any contact by URL and read NRIC/passport numbers, budget and notes.
  // notFound() rather than a 403 so the page does not confirm the record exists.
  if (!canView(me, contact.assignedTo)) notFound();
  const editable = await canEditOwned(me, contact.assignedTo);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">{contact.name}</h1>
        {editable && <Link href={`/contacts/${contact.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Phone" value={contact.phone} href={`tel:${contact.phone}`} />
          <Field
            label="Email"
            value={contact.email ?? "—"}
            href={contact.email ? `mailto:${contact.email}` : undefined}
          />
          <Field label="Interest" value={contact.interest ?? "—"} />
          <Field label="Budget" value={`${formatMYR(contact.budgetMin)}${contact.budgetMax ? ` – ${formatMYR(contact.budgetMax)}` : ""}`} />
          <Field label="Nationality" value={contact.nationality ?? "—"} />
          <Field label="Occupation" value={contact.occupation ?? "—"} />
          <Field label="ID" value={contact.idType ? `${contact.idType}: ${contact.idNumber ?? "—"}` : "—"} />
          <Field label="Consent" value={contact.consentGivenAt ? `Given (${contact.consentSource ?? "n/a"})` : "Not recorded"} />
        </CardContent>
      </Card>
      {contact.notes && (
        <Card><CardHeader><CardTitle>Notes</CardTitle></CardHeader><CardContent className="text-sm whitespace-pre-wrap">{contact.notes}</CardContent></Card>
      )}
      {editable && (
        <CreateDealButton
          contactId={contact.id}
          projects={await listProjectOptions()}
          defaultProjectId={await getLeadProjectId(contact.sourceLeadId)}
        />
      )}

      {editable && (
        <Card>
          <CardHeader><CardTitle>Appointments</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <AppointmentList
              items={await listAppointmentsForClient(me, { contactId: contact.id })}
              empty="No appointments yet."
            />
            <ScheduleAppointment
              contactId={contact.id}
              listings={await listPickableListings()}
              projects={await listProjectOptions()}
              agents={(await listAssignableAgents()).filter((a) => a.id !== me.id)}
            />
          </CardContent>
        </Card>
      )}

      {editable && (
        <WhatsAppButton
          entityType="contacts"
          entityId={contact.id}
          toPhone={contact.phone}
          defaultMessage={`Hi ${contact.name.split(" ")[0] ?? contact.name}, `}
          templates={await listActiveTemplates("whatsapp")}
          listings={await listPickableListings()}
          values={{
            name: contact.name.split(" ")[0] ?? contact.name,
            fullName: contact.name,
            agent: me.name,
            agency: APP_NAME,
            area: contact.preferredAreas,
          }}
        />
      )}

      <MatchingListings
        criteria={{
          interest: contact.interest,
          budgetMin: contact.budgetMin,
          budgetMax: contact.budgetMax,
          preferredAreas: contact.preferredAreas,
        }}
        who={contact.name.split(" ")[0] ?? "this client"}
      />

      <ActivitySection entityType="contacts" entityId={contact.id} canLog={editable} />

      {isAdmin(me) && <PdpaPanel contactId={contact.id} />}
    </div>
  );
}

function Field({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  /**
   * Makes the value tappable — `tel:` or `mailto:`.
   *
   * A qualified client's number was plain text here. This is the record an agent opens
   * to ring somebody they are already working; not being able to dial from it is the
   * kind of friction that sends people back to their phone's own contacts app, which
   * is where client history stops being recorded.
   *
   * h-11 on the tap target: 44px is the smallest thing reliably hit one-handed.
   */
  href?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {href ? (
        <a
          href={href}
          className="-mx-1 inline-flex h-11 items-center rounded-lg px-1 font-medium text-primary underline underline-offset-4 hover:brightness-110"
        >
          {value}
        </a>
      ) : (
        <div>{value}</div>
      )}
    </div>
  );
}
