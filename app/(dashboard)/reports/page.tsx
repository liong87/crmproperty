import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { getReportData } from "@/server/reports/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard, BarList } from "@/components/reports/charts";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMYR } from "@/lib/utils";

export default async function ReportsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const r = await getReportData(me);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">{r.scope === "team" ? "Team-wide metrics." : "Your book of business."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total leads" value={String(r.totalLeads)} />
        <StatCard label="Qualified" value={String(r.qualifiedLeads)} />
        <StatCard label="Conversion" value={`${Math.round(r.conversionRate * 100)}%`} />
        <StatCard label="Open pipeline" value={formatMYR(r.openPipelineValue)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Leads by status</CardTitle></CardHeader>
          <CardContent><BarList rows={r.leadsByStatus} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Properties by status</CardTitle></CardHeader>
          <CardContent><BarList rows={r.propertiesByStatus} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Pipeline by stage</CardTitle></CardHeader>
        <CardContent>
          <BarList
            rows={r.dealsByStage.map((s) => ({ label: s.label, value: s.count, sub: `${s.count} · ${formatMYR(s.value)}` }))}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <StatCard label="Activities (7 days)" value={String(r.activitiesLast7Days)} />
        <StatCard label="Deal stages" value={String(r.dealsByStage.length)} />
      </div>

      {r.leaderboard.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Agent leaderboard</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Agent</TH><TH>Leads</TH><TH>Contacts</TH><TH>Won value</TH></TR></THead>
              <TBody>
                {r.leaderboard.map((a) => (
                  <TR key={a.name}>
                    <TD className="font-medium">{a.name}</TD>
                    <TD>{a.leads}</TD>
                    <TD>{a.contacts}</TD>
                    <TD>{formatMYR(a.wonValue)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
