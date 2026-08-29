import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { getReportData } from "@/server/reports/queries";
import { getFunnel, getFunnelTrend } from "@/server/reports/funnel";
import { getAgentActivity } from "@/server/reports/activity";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard, BarList } from "@/components/reports/charts";
import { FunnelChart, FunnelBreakdown } from "@/components/reports/funnel";
import { TrendChart } from "@/components/reports/trend";
import { RangeFilter, parseRangeDays, rangeLabel } from "@/components/reports/range-filter";
import { STATUS } from "@/lib/chart-colors";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMYR } from "@/lib/utils";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const days = parseRangeDays((await searchParams).days);
  // Weekly points, floored at 4 so a short window still draws a line, and capped so
  // "All time" cannot render hundreds of unreadable buckets.
  const weeks = Math.min(104, Math.max(4, Math.ceil(days / 7)));
  const [r, funnel, trend, activity] = await Promise.all([
    getReportData(me),
    getFunnel(me, days),
    getFunnelTrend(me, weeks),
    getAgentActivity(me, days),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">{r.scope === "team" ? "Team-wide metrics." : "Your book of business."}</p>
        </div>
        {/* Spend is the agency's cost base, not an agent's business. */}
        {isManagerOrAbove(me) && (
          <Link href="/reports/spend" className="text-sm font-medium underline underline-offset-4">
            Advertising spend →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total leads" value={String(r.totalLeads)} />
        <StatCard label="Qualified" value={String(r.qualifiedLeads)} />
        <StatCard label="Conversion" value={`${Math.round(r.conversionRate * 100)}%`} />
        <StatCard label="Open pipeline" value={formatMYR(r.openPipelineValue)} />
      </div>

      {/*
        The selector drives the funnel, the trend and the breakdowns below — the parts
        that describe a PERIOD. The tiles above are current state (open pipeline is a
        snapshot, not a total), so windowing them would say something untrue.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <h2 className="text-base font-semibold">Funnel · {rangeLabel(days)}</h2>
        <RangeFilter days={days} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <FunnelChart data={funnel} />
        <TrendChart points={trend} />
      </div>

      <FunnelBreakdown
        title="By project"
        rows={funnel.byProject}
        emptyHint="No leads or appointments in this window yet."
      />

      {funnel.byAgent.length > 0 && (
        <FunnelBreakdown
          title="By agent"
          rows={funnel.byAgent}
          emptyHint="No activity in this window yet."
          columns={{ appointments: "Set", showedUp: "Showed", booked: "Booked" }}
          note="Appointments are credited to whoever set them; show-ups and bookings to whoever ran the presentation."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {activity.scope === "team" ? "Outreach by agent" : "Your outreach"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Said plainly, because a zero here is ambiguous and someone will act on it.
              Nothing in the product dials a phone or sends a WhatsApp on its own. */}
          <p className="text-sm text-muted-foreground">
            Calls and WhatsApp messages <em>logged</em> in the last {days} days — not calls made.
            A zero means nothing was recorded, which is a reason to ask rather than a conclusion.
          </p>

          {activity.empty ? (
            <p className="text-sm text-muted-foreground">
              Nothing logged in this window yet. Activity is recorded from a lead or contact
              page, so these counts only mean something once the team logs calls there.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Agent</TH>
                  <TH className="text-right">Calls</TH>
                  <TH className="text-right">WhatsApp</TH>
                  <TH className="text-right">Leads touched</TH>
                </TR>
              </THead>
              <TBody>
                {activity.rows.map((a) => (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.name}</TD>
                    {/* Quietest first, so the row that needs a conversation is at the top. */}
                    <TD className={`text-right ${a.calls === 0 ? "text-destructive" : ""}`}>{a.calls}</TD>
                    <TD className="text-right">{a.whatsapp}</TD>
                    <TD className="text-right text-muted-foreground">{a.leadsTouched}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
