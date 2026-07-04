import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit } from "@/lib/auth";
import { getContactById } from "@/server/contacts/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateDealButton } from "@/components/deals/create-deal-button";
import { ActivitySection } from "@/components/activities/activity-section";
import { WhatsAppButton } from "@/components/activities/whatsapp-button";
import { PdpaPanel } from "@/components/pdpa/pdpa-panel";
import { isAdmin } from "@/lib/auth";
import { formatMYR } from "@/lib/utils";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();
  const editable = canEdit(me, contact.assignedTo);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{contact.name}</h1>
        {editable && <Link href={`/contacts/${contact.id}/edit`}><Button size="sm" variant="outline">Edit</Button></Link>}
      </div>
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <Field label="Phone" value={contact.phone} />
          <Field label="Email" value={contact.email ?? "—"} />
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
      {editable && <CreateDealButton contactId={contact.id} />}

      {editable && <WhatsAppButton entityType="contacts" entityId={contact.id} toPhone={contact.phone} defaultMessage={`Hi ${contact.name}, `} />}

      <ActivitySection entityType="contacts" entityId={contact.id} canLog={editable} />

      {isAdmin(me) && <PdpaPanel contactId={contact.id} />}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div>{value}</div></div>;
}
