import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/queries";
import { listFollowUps } from "@/server/activities/queries";
import { listDocumentsDue } from "@/server/deal-documents/queries";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { InboxList } from "@/components/notifications/inbox-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
        <h1 className="font-display text-2xl font-bold tracking-tight">Inbox</h1>
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
          <CardContent className="px-0 pb-2">
            {/*
              One row per DEAL, documents nested inside it.

              A booking carries a dozen documents, so a flat list repeated the same
              client and project on every line and pushed everything else off the page.
              The deal is the unit of work; the documents are its detail.

              <details> rather than React state: the browser implements a disclosure,
              it renders open-or-closed correctly on the server, and it is keyboard
              operable with no JavaScript. Anything overdue starts open — that is the
              case that must not be hidden behind a click.
            */}
            <ul className="divide-y">
              {Object.values(
                docs.reduce<Record<string, typeof docs>>((acc, d) => {
                  (acc[d.dealId] ||= []).push(d);
                  return acc;
                }, {}),
              ).map((group) => {
                const first = group[0]!;
                const overdueCount = group.filter((d) => d.daysUntilDue < 0).length;
                const soonest = group.reduce((a, b) => (a.daysUntilDue <= b.daysUntilDue ? a : b));
                return (
                  <li key={first.dealId}>
                    <details open={overdueCount > 0} className="group/deal">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/deal:rotate-90 motion-reduce:transition-none"
                        />
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                          <Link
                            href={`/deals/${first.dealId}`}
                            className="truncate font-medium hover:underline"
                          >
                            {first.contactName}
                          </Link>
                          {first.subjectTitle && (
                            /* Bounded and nowrap: a project name is unpredictable in
                               length ("Lanthorn Residences @ KL Eco City") and a pill
                               that wraps to two lines stops reading as a pill. The full
                               value stays reachable — it is the heading of the deal
                               page this row links to. */
                            <Badge
                              variant="outline"
                              className="max-w-[16rem] shrink truncate whitespace-nowrap"
                              title={first.subjectTitle}
                            >
                              {first.subjectTitle}
                            </Badge>
                          )}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {group.length} outstanding
                          </span>
                        </span>
                        {/* The one number that decides whether this row needs you today. */}
                        {overdueCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-destructive">
                            {overdueCount} overdue
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {soonest.daysUntilDue === 0 ? "Due today" : dateFmt.format(soonest.dueAt)}
                          </span>
                        )}
                      </summary>

                      <ul className="pb-2 pl-12 pr-5">
                        {group.map((d) => {
                          const late = d.daysUntilDue < 0;
                          return (
                            <li
                              key={d.id}
                              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5 text-sm"
                            >
                              <Link
                                href={`/deals/${d.dealId}`}
                                title={d.label}
                                className="min-w-0 truncate hover:underline"
                              >
                                {d.label}
                              </Link>
                              <span
                                className={
                                  late
                                    ? "shrink-0 text-xs font-semibold tabular-nums text-destructive"
                                    : "shrink-0 text-xs tabular-nums text-muted-foreground"
                                }
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
                    </details>
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
