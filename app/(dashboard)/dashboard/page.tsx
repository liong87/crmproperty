import Link from "next/link";
import { Inbox, UserCheck, Wallet, BellRing, Activity } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listFollowUps } from "@/server/activities/queries";
import { getReportData } from "@/server/reports/queries";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatTile } from "@/components/reports/stat-tile";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { formatMYR } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await getCurrentDbUser();
  if (!user) return null;

  const [followUps, report] = await Promise.all([listFollowUps(user), getReportData(user)]);
  const overdue = followUps.filter((f) => f.overdue).length;
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open leads" value={String(report.totalLeads)} icon={Inbox} />
        <StatTile label="Qualified" value={String(report.qualifiedLeads)} icon={UserCheck}
          hint={`${Math.round(report.conversionRate * 100)}% conversion`} />
        <StatTile label="Open pipeline" value={formatMYR(report.openPipelineValue)} icon={Wallet} accent />
        <StatTile label="Follow-ups due" value={String(followUps.length)} icon={BellRing}
          hint={overdue > 0 ? `${overdue} overdue` : "on track"} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Upcoming follow-ups</CardTitle>
          <Link href="/reminders" className="text-sm text-primary underline-offset-2 hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          <FollowUpList items={followUps.slice(0, 5)} />
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
