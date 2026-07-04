import { notFound, redirect } from "next/navigation";
import { getCurrentDbUser, canEdit } from "@/lib/auth";
import { getContactById } from "@/server/contacts/queries";
import { ContactForm } from "@/components/contacts/contact-form";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const { id } = await params;
  const c = await getContactById(id);
  if (!c) notFound();
  if (!canEdit(me, c.assignedTo)) redirect(`/contacts/${id}`);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Edit Contact</h1>
      <ContactForm
        contactId={c.id}
        defaults={{
          name: c.name, phone: c.phone, email: c.email ?? "",
          interest: c.interest ?? "",
          budgetMinRM: c.budgetMin != null ? String(c.budgetMin / 100) : "",
          budgetMaxRM: c.budgetMax != null ? String(c.budgetMax / 100) : "",
          preferredAreas: c.preferredAreas ?? "",
          idType: c.idType ?? "", idNumber: c.idNumber ?? "",
          nationality: c.nationality ?? "", occupation: c.occupation ?? "", notes: c.notes ?? "",
        }}
      />
    </div>
  );
}
