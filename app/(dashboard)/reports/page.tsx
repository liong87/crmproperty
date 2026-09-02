import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { getReportData } from "@/server/reports/queries";
import { getFunnel, getFunnelTrend } from "@/server/reports/funnel";
import { getAgentActivity } from "@/server/reports/activity";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard, BarList } from "@/components/reports/charts";
import { FunnelChart, FunnelBreakdown } from "@/components/reports/funnel";
import { TrendChart } from "@/components/reports/trend";
import { resolveRange } from "@/lib/reports/range";
import { ReportControls, ReportTabs, PrintHeader } from "@/components/reports/report-controls";
import { PrintButton } from "@/components/reports/print-button";
import { SourceTable, FollowUpTable } from "@/components/reports/source-table";
import { CampaignTab } from "@/components/reports/campaign-tab";
import { getLeadsBySource, getFollowUpByAgent } from "@/server/reports/by-source";
import { listProjectOptions } from "@/server/projects/queries";
import { OPEN_STATUSES } from "@/lib/constants";
import { STATUS } from "@/lib/chart-colors";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatMYR } from "@/lib/utils";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const params = await searchParams;
  const range = resolveRange(params);
  const days = range.days;
  const tab = params.tab === "campaign" ? "campaign" : "lead";

  // Weekly points, floored at 4 so a short window still draws a line, and capped so
  // "Maximum" cannot render hundreds of unreadable buckets.
  const weeks = Math.min(104, Math.max(4, Math.ceil(days / 7)));

  const [r, funnel, trend, activity, bySource, followUp, projects] = await Promise.all([
    getReportData(me),
    getFunnel(me, days),
    getFunnelTrend(me, weeks),
    getAgentActivity(me, days),
    getLeadsBySource(me, {
      sinceDays: days,
      source: params.source ?? null,
      projectId: params.project ?? null,
    }),
    getFollowUpByAgent(me, OPEN_STATUSES),
    listProjectOptions(),
  ]);

  // Offered as chips only when leads actually carry them — an empty filter row is
  // furniture, and a filter for a source nobody uses is a dead end. Taken from
  // availableSources rather than the filtered rows, so picking one does not remove
  // every other chip and strand the user on it.
  const sourceChips = bySource.availableSources;
  const activeFilters = [
    params.source ? `Source: ${sourceChips.find((s) => s.key === params.source)?.label ?? params.source}` : null,
    params.project ? `Product: ${projects.find((p) => p.id === params.project)?.name ?? params.project}` : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="space-y-4">
      <PrintHeader
        title={tab === "campaign" ? "Meta ads report" : "Lead performance"}
        rangeLabel={range.label}
        filters={activeFilters}
      />

      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Report</h1>
          <p className="text-sm text-muted-foreground">
            {r.scope === "team" ? "Lead performance and campaign analytics." : "Your book of business."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton />
          {/* Spend is the agency's cost base, not an agent's business. */}
          {isTeamLeadOrAbove(me) && (
            <Link href="/reports/spend" className="text-sm font-medium underline underline-offset-4">
              Advertising spend →
            </Link>
          )}
        </div>
      </div>

      <ReportTabs params={params} />

      {tab === "campaign" ? (
        <CampaignTab enabled={process.env.FEATURE_META_ADS === "1"} />
      ) : (
      <>
      <ReportControls params={params} sources={sourceChips} projects={projects} />

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
        <h2 className="text-base font-semibold">Funnel · {range.label}</h2>
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

      <SourceTable data={bySource} />

      <FollowUpTable rows={followUp} />

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
            Calls and WhatsApp messages <em>logged</em> in {range.label.toLowerCase()} — not calls made.
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
      </>
      )}
    </div>
  );
}