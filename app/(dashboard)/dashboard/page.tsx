import Link from "next/link";
import { Inbox, UserCheck, Wallet, BellRing, Activity, CalendarCheck } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listFollowUps } from "@/server/activities/queries";
import { listUpcomingAppointments, countAppointmentsNeedingOutcome } from "@/server/appointments/queries";
import { AppointmentList } from "@/components/appointments/appointment-list";
import { getReportData } from "@/server/reports/queries";
import { getFunnel, getFunnelTrend } from "@/server/reports/funnel";
import { STATUS } from "@/lib/chart-colors";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/reports/stat-tile";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { formatMYR } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentDbUser();
  if (!user) return null;

  // Ask for 5, not "all of them then slice to 5".
  const [followUps, report, appts, toWriteUp, funnel, trend] = await Promise.all([
    listFollowUps(user, 5),
    getReportData(user),
    listUpcomingAppointments(user, 5),
    countAppointmentsNeedingOutcome(user),
    getFunnel(user),
    getFunnelTrend(user, 8),
  ]);
  const overdue = followUps.filter((f) => f.overdue).length;
  const booked = funnel.stages.find((s) => s.key === "booked")?.count ?? 0;
  // No-show rate is the one tile here that means good or bad, so it is the only one
  // that earns a status colour.
  const noShowTone =
    funnel.noShowRate == null ? undefined
      : funnel.noShowRate > 0.3 ? STATUS.critical
      : funnel.noShowRate > 0.15 ? STATUS.warning
      : STATUS.good;
  const firstName = user.name.split(" ")[0] ?? user.name;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {report.scope === "team" ? "Team overview" : "Your workspace"}
        </p>
        <h1 className="text-2xl font-semibold">Welcome back, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {overdue > 0
            ? `${overdue} follow-up${overdue > 1 ? "s are" : " is"} overdue — worth a look.`
            : "Nothing overdue. Here's where things stand."}
        </p>
      </div>

      {/* Six tiles: the row divides evenly at 2 (mobile), 3 and 6, so none is orphaned
          on a second line at any breakpoint. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
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
          label="Booked"
          value={String(booked)}
          icon={Wallet}
          accent
          hint={`last ${funnel.sinceDays} days`}
          spark={trend.map((t) => t.booked)}
        />
        <StatTile
          label="No-show rate"
          value={funnel.noShowRate == null ? "—" : `${Math.round(funnel.noShowRate * 100)}%`}
          icon={Activity}
          tone={noShowTone}
          hint="kept or missed"
        />
        <StatTile label="Follow-ups due" value={String(followUps.length)} icon={BellRing}
          hint={overdue > 0 ? `${overdue} overdue` : "on track"} />
        <StatTile
          label="Appointments ahead"
          value={String(appts.length)}
          icon={CalendarCheck}
          hint={toWriteUp > 0 ? `${toWriteUp} to write up` : undefined}
          spark={trend.map((t) => t.appointments)}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Upcoming follow-ups</CardTitle>
          <Link href="/reminders" className="text-sm text-primary underline-offset-2 hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          <FollowUpList items={followUps} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Upcoming appointments</CardTitle>
          <Link href="/appointments" className="text-sm text-primary underline-offset-2 hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          <AppointmentList items={appts} empty="No appointments scheduled." />
        </CardContent>
      </Card>

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
