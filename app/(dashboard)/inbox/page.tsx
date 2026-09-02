import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/queries";
import { listFollowUps } from "@/server/activities/queries";
import { listDocumentsDue } from "@/server/deal-documents/queries";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { InboxList } from "@/components/notifications/inbox-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS } from "@/lib/chart-colors";

export const metadata = { title: "Inbox" };

const dateFmt = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
});

/**
 * Everything waiting on you, on one page.
 *
 * Inbox and Reminders were two pages answering the same question — "what needs me?" —
 * which meant an agent had to check both and, in practice, checked neither reliably.
 *
 * Ordered by what cannot be recovered. Paperwork first: a follow-up call can slip a day,
 * an expired loan approval cannot be un-expired. Follow-ups next, because that is the
 * day's work. Notifications last: they are mostly a record that something already shown
 * above happened, and putting them on top would show every fact twice.
 */
export default async function InboxPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const [notifications, followUps, docs] = await Promise.all([
    listNotifications(me.id),
    listFollowUps(me, 200),
    listDocumentsDue(me),
  ]);

  const overdue = followUps.filter((i) => i.overdue).length;
  const docsOverdue = docs.filter((d) => d.daysUntilDue < 0).length;
  const nothing = notifications.length === 0 && followUps.length === 0 && docs.length === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          {isTeamLeadOrAbove(me) ? "Everything open across the team." : "Everything waiting on you."}
          {overdue > 0 && ` · ${overdue} follow-up${overdue === 1 ? "" : "s"} overdue`}
          {docsOverdue > 0 && ` · ${docsOverdue} document${docsOverdue === 1 ? "" : "s"} overdue`}
        </p>
      </div>

      {nothing && (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing needs you right now.
        </p>
      )}

      {docs.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Paperwork due</CardTitle>
            <p className="text-xs text-muted-foreground">
              Next 14 days, plus anything already overdue
              {docsOverdue > 0 && ` · ${docsOverdue} overdue`}
            </p>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {docs.map((d) => {
                const late = d.daysUntilDue < 0;
                return (
                  <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/deals/${d.dealId}`} className="font-medium hover:underline">
                        {d.label}
                      </Link>
                      <span className="text-muted-foreground">
                        {" "}· {d.contactName}
                        {d.subjectTitle ? ` · ${d.subjectTitle}` : ""}
                      </span>
                    </div>
                    <span
                      className={late ? "font-semibold" : "text-muted-foreground"}
                      style={late ? { color: STATUS.critical } : undefined}
                    >
                      {late
                        ? `${Math.abs(d.daysUntilDue)} day${Math.abs(d.daysUntilDue) === 1 ? "" : "s"} overdue`
                        : d.daysUntilDue === 0
                          ? "Due today"
                          : dateFmt.format(d.dueAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {followUps.length > 0 && <FollowUpList items={followUps} />}

      {notifications.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent><InboxList items={notifications} /></CardContent>
        </Card>
      )}
    </div>
  );
}
