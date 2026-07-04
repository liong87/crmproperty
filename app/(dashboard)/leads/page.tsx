import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listLeadsPaginated, type LeadStatus } from "@/server/leads/queries";
import { LEAD_STATUS } from "@/lib/constants";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMYR } from "@/lib/utils";
import { leadStatusTone } from "@/lib/status";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const sp = await searchParams;
  const status = (LEAD_STATUS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as LeadStatus)
    : undefined;
  const page = Number(sp.page ?? "1") || 1;

  const { items, total, pageSize } = await listLeadsPaginated(me, { search: sp.q, status, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        <div className="flex gap-2">
          <Link href="/leads/import"><Button size="sm" variant="outline">Import CSV</Button></Link>
          <Link href="/leads/new"><Button size="sm">New Lead</Button></Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2" action="/leads">
        <input
          name="q" defaultValue={sp.q ?? ""} placeholder="Search name / phone / email"
          className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
        />
        <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All statuses</option>
          {LEAD_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <Button type="submit" size="sm" variant="outline">Filter</Button>
      </form>

      <Table>
        <THead>
          <TR><TH>Name</TH><TH>Phone</TH><TH>Interest</TH><TH>Budget</TH><TH>Status</TH></TR>
        </THead>
        <TBody>
          {items.map((l) => (
            <TR key={l.id}>
              <TD className="font-medium"><Link href={`/leads/${l.id}`} className="hover:underline">{l.name}</Link></TD>
              <TD className="text-muted-foreground">{l.phone}</TD>
              <TD>{l.interest ?? "—"}</TD>
              <TD>{formatMYR(l.budgetMin)}{l.budgetMax ? ` – ${formatMYR(l.budgetMax)}` : ""}</TD>
              <TD><Badge className={leadStatusTone(l.status)}>{l.status}</Badge></TD>
            </TR>
          ))}

        </TBody>
      </Table>
      {items.length === 0 && <EmptyState icon={Inbox} title="No leads found" hint="Capture a new lead or adjust your filters." />}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {pages} · {total} total</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={`/leads?page=${page - 1}${sp.q ? `&q=${sp.q}` : ""}${status ? `&status=${status}` : ""}`}><Button size="sm" variant="outline">Prev</Button></Link>}
            {page < pages && <Link href={`/leads?page=${page + 1}${sp.q ? `&q=${sp.q}` : ""}${status ? `&status=${status}` : ""}`}><Button size="sm" variant="outline">Next</Button></Link>}
          </div>
        </div>
      )}
    </div>
  );
}
