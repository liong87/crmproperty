import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listLeadsPaginated, type LeadStatus } from "@/server/leads/queries";
import { listAssignableUsers } from "@/server/users/queries";
import { LEAD_STATUS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LeadsTable } from "@/components/leads/leads-table";
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

  /*
   * The assignee list is fetched only for someone who may reassign. An agent's browser
   * therefore never receives the roster of their colleagues — the permission check and
   * the data boundary are the same line.
   */
  const canAssign = me.role !== "agent";
  const [{ items, total, pageSize }, assignees] = await Promise.all([
    listLeadsPaginated(me, { search: sp.q, status, page }),
    canAssign ? listAssignableUsers() : Promise.resolve([]),
  ]);
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

      <LeadsTable
        rows={items.map((l) => ({
          id: l.id,
          name: l.name,
          phone: l.phone,
          interest: l.interest,
          budgetMin: l.budgetMin,
          budgetMax: l.budgetMax,
          assigneeName: l.assigneeName,
          assignedTo: l.assignedTo,
          status: l.status,
        }))}
        // Deletion is admin-only, matching deleteLead: an agent who can erase leads
        // can erase the evidence of ones they never worked.
        canDelete={me.role === "admin"}
        assignees={assignees}
      />
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
