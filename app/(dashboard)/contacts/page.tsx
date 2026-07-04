import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listContactsPaginated } from "@/server/contacts/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { formatMYR } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Contact } from "lucide-react";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const { items, total, pageSize } = await listContactsPaginated(me, { search: sp.q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Contacts</h1>
      <form className="flex gap-2" action="/contacts">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search name / phone / email"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm" />
        <Button type="submit" size="sm" variant="outline">Search</Button>
      </form>
      <Table>
        <THead><TR><TH>Name</TH><TH>Phone</TH><TH>Interest</TH><TH>Budget</TH></TR></THead>
        <TBody>
          {items.map((c) => (
            <TR key={c.id}>
              <TD className="font-medium"><Link href={`/contacts/${c.id}`} className="hover:underline">{c.name}</Link></TD>
              <TD className="text-muted-foreground">{c.phone}</TD>
              <TD>{c.interest ?? "—"}</TD>
              <TD>{formatMYR(c.budgetMin)}{c.budgetMax ? ` – ${formatMYR(c.budgetMax)}` : ""}</TD>
            </TR>
          ))}

        </TBody>
      </Table>
      {items.length === 0 && <EmptyState icon={Contact} title="No contacts yet" hint="Qualify a lead to create your first contact." />}
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/contacts?page=${page - 1}${sp.q ? `&q=${sp.q}` : ""}`}><Button size="sm" variant="outline">Prev</Button></Link>}
            {page < pages && <Link href={`/contacts?page=${page + 1}${sp.q ? `&q=${sp.q}` : ""}`}><Button size="sm" variant="outline">Next</Button></Link>}
          </div>
        </div>
      )}
    </div>
  );
}
