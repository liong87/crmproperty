import { PageTitle } from "@/components/ui/page-title";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users2, Phone, MessageCircle, Inbox } from "lucide-react";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { who } from "@/lib/user-name";
import { listTeamMembers } from "@/server/users/hierarchy";
import { getAgentActivity } from "@/server/reports/activity";
import { RangeFilter, parseRangeDays, rangeLabel } from "@/components/reports/range-filter";
import { lastNDays } from "@/lib/reports/range";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * My team — who reports to me, and whether they are working.
 *
 * The activity numbers count what was LOGGED, not what was done. Nothing here dials a
 * phone, so a zero means "nothing recorded" and is a prompt to ask, never a verdict.
 * That sentence is on the page for the same reason it is in the query's docblock: a
 * table of low numbers invites a conclusion it cannot support.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isTeamLeadOrAbove(me)) redirect("/dashboard");

  const days = parseRangeDays((await searchParams).days);
  const [members, activity] = await Promise.all([
    listTeamMembers(me.id),
    getAgentActivity(me, lastNDays(days)),
  ]);

  const byId = new Map(activity.rows.map((r) => [r.id, r]));

  return (
    <div className="space-y-5">
      <PageTitle
        title="My team"
        count={members.length}
        actions={<RangeFilter days={days} basePath="/team" />}
      >
        {members.length === 1 ? "person" : "people"} reporting to you.
      </PageTitle>

      {members.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No team members"
          hint="An administrator sets who reports to you, under Settings → Users."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Activity · last {rangeLabel(days).toLowerCase()}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Calls and WhatsApp messages <strong>logged</strong> in the CRM. A zero means
                nothing was recorded, which is not the same as no work — worth asking about,
                not concluding from.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Person</TH>
                    <TH>Calls</TH>
                    <TH>WhatsApp</TH>
                    <TH>Leads touched</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {members.map((m) => {
                    const a = byId.get(m.id);
                    return (
                      <TR key={m.id}>
                        <TD className="font-medium">{who(m.name, m.id, me.id)}</TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {a?.calls ?? 0}
                          </span>
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5">
                            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            {a?.whatsapp ?? 0}
                          </span>
                        </TD>
                        <TD>
                          <span className="inline-flex items-center gap-1.5">
                            <Inbox className="h-3.5 w-3.5 text-muted-foreground" />
                            {a?.leadsTouched ?? 0}
                          </span>
                        </TD>
                        <TD>
                          {m.active
                            ? <Badge variant="secondary">{m.role.replace("_", " ")}</Badge>
                            : <Badge variant="outline">inactive</Badge>}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            Looking for outcomes rather than effort?{" "}
            <Link href="/reports" className="text-primary underline underline-offset-2">
              Reports
            </Link>{" "}
            breaks the funnel down per person.
          </p>
        </>
      )}
    </div>
  );
}
