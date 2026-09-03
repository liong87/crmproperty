import Link from "next/link";
import { Inbox, UserCheck, BellRing, Activity, CalendarCheck, Snowflake } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listFollowUps } from "@/server/activities/queries";
import { countStaleLeads, STALE_AFTER_DAYS } from "@/server/leads/stale";
import { listUpcomingAppointments, countAppointmentsNeedingOutcome } from "@/server/appointments/queries";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { getReportData } from "@/server/reports/queries";
import { getFunnel, getFunnelTrend } from "@/server/reports/funnel";
import { countDocumentsDue } from "@/server/deal-documents/queries";
import { STATUS } from "@/lib/chart-colors";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/reports/stat-tile";
import { FunnelBand } from "@/components/dashboard/funnel-band";
import { RangeFilter, parseRangeDays, rangeLabel } from "@/components/reports/range-filter";
import { lastNDays } from "@/lib/reports/range";
import { PageTitle } from "@/components/ui/page-title";
import { FollowUpList } from "@/components/activities/follow-up-list";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await getCurrentDbUser();
  if (!user) return null;
  const days = parseRangeDays((await searchParams).days);

  // Ask for 5, not "all of them then slice to 5".
  const [followUps, report, appts, toWriteUp, funnel, trend, staleCount, docsDue] = await Promise.all([
    listFollowUps(user, 5),
    getReportData(user),
    listUpcomingAppointments(user, 5),
    countAppointmentsNeedingOutcome(user),
    getFunnel(user, lastNDays(days)),
    getFunnelTrend(user, 8),
    countStaleLeads(user),
    countDocumentsDue(user),
  ]);
  const overdue = followUps.filter((f) => f.overdue).length;
  // No-show rate is the one tile here that means good or bad, so it is the only one
  // that earns a status colour.
  const noShowTone =
    funnel.noShowRate == null ? undefined
      : funnel.noShowRate > 0.3 ? STATUS.critical
      : funnel.noShowRate > 0.15 ? STATUS.warning
      : STATUS.good;
  const firstName = user.name.split(" ")[0] ?? user.name;
  // Malaysia time, so the greeting matches the agent's actual afternoon.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kuala_Lumpur" })
      .format(new Date()),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <PageTitle
        title={`${greeting}, ${firstName}`}
        actions={<RangeFilter days={days} basePath="/dashboard" />}
      >
        {overdue > 0
          ? `${overdue} follow-up${overdue > 1 ? "s are" : " is"} overdue — worth a look.`
          : "Here's how your leads are moving."}
      </PageTitle>

      {docsDue.overdue > 0 && (
        <Link
          href="/inbox"
          className="block rounded-xl border p-4 transition-colors hover:bg-muted/40"
          style={{ borderColor: STATUS.critical }}
        >
          <p className="text-sm">
            <strong className="font-semibold" style={{ color: STATUS.critical }}>
              {docsDue.overdue} document{docsDue.overdue === 1 ? " is" : "s are"} overdue
            </strong>{" "}
            across your deals. An expired loan approval is the commonest way a booking
            collapses.
          </p>
        </Link>
      )}

      {/* The funnel first, because it is the question the dashboard exists to answer:
          where are people falling out. The tiles below are the day's workload.

          Drawn as one tapering band rather than tiles: you see where it narrows before
          you read a number, which is the whole point and something separate tiles
          cannot do. */}
      <Card>
        <CardHeader className="flex-row items-baseline justify-between pb-0">
          <CardTitle>Your funnel</CardTitle>
          <span className="text-xs text-muted-foreground">
            Last {rangeLabel(days).toLowerCase()}
          </span>
        </CardHeader>
        <FunnelBand
          stages={funnel.stages.map((st) => ({ label: st.label, value: st.count }))}
        />
      </Card>

      {/* Four tiles, not six: booked and appointments now live in the strip above, and
          repeating them here taught the eye to skip the row. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {/* openLeads, not totalLeads: a disqualified lead is finished work, and
            showing it here made the tile useless as a "do I have anything to chase"
            signal. */}
        <StatTile
          label="Open leads"
          value={String(report.openLeads)}
          icon={Inbox}
          hint={report.totalLeads !== report.openLeads ? `${report.totalLeads} total` : undefined}
        />
        <StatTile label="Qualified" value={String(report.qualifiedLeads)} icon={UserCheck}
          hint={`${Math.round(report.conversionRate * 100)}% conversion`} />
        <StatTile
          label="No-show rate"
          value={funnel.noShowRate == null ? "—" : `${Math.round(funnel.noShowRate * 100)}%`}
          icon={Activity}
          tone={noShowTone}
          hint="kept or missed"
        />
        <StatTile
          label="Appointments ahead"
          value={String(appts.length)}
          icon={CalendarCheck}
          accent
          hint={toWriteUp > 0 ? `${toWriteUp} to write up` : undefined}
          spark={trend.map((t) => t.appointments)}
        />
      </div>

      {/* Shown only when it applies. A permanent "0 going cold" row is furniture the
          eye learns to skip, which is exactly what this must not become. */}
      {staleCount > 0 && (
        <Link
          href="/leads/stale"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm transition-colors hover:bg-amber-100"
        >
          <span className="flex items-center gap-2 text-amber-900">
            <Snowflake className="h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">{staleCount}</strong>{" "}
              {staleCount === 1 ? "lead has" : "leads have"} had nothing logged for{" "}
              {STALE_AFTER_DAYS} days or more
            </span>
          </span>
          <span className="shrink-0 font-medium text-amber-900 underline underline-offset-2">
            Review
          </span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-muted-foreground" /> Upcoming follow-ups
            </CardTitle>
            <Link href="/inbox" className="text-sm text-primary underline-offset-2 hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            <FollowUpList items={followUps} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-muted-foreground" /> Upcoming appointments
            </CardTitle>
            <Link href="/appointments" className="text-sm text-primary underline-offset-2 hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            <AppointmentList items={appts} empty="No appointments scheduled." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink href="/leads" title="Leads" desc="Capture & qualify inquiries" />
        <QuickLink href="/properties" title="Properties" desc="Browse & manage listings" />
        <QuickLink href="/pipeline" title="Pipeline" desc="Move deals to close" />
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" /> {report.activitiesLast7Days} activities logged in the last 7 days
      </p>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-secondary/40">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-muted-foreground">{desc}</div>
      <span className="mt-2 inline-block text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">Open →</span>
    </Link>
  );
}
