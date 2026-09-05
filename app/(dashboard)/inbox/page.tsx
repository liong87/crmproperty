import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/queries";
import { listFollowUps } from "@/server/activities/queries";
import { listDocumentsDue } from "@/server/deal-documents/queries";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { InboxList } from "@/components/notifications/inbox-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronRight, Inbox as InboxIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";

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
/**
 * The one filter this page needs, and why it is not "unread".
 *
 * Outlook's All / Unread works because every row there is the same kind of object and
 * read-state is the axis you triage on. Two of the three sections below are DERIVED —
 * paperwork comes from deals, follow-ups from activities — and neither has, or can
 * have, a read state: an item leaves by being done. Only notifications are stored rows
 * with `readAt`, so an Unread control at the top would silently do nothing to two
 * thirds of the page, which is worse than no control at all.
 *
 * The axis that IS shared is lateness. "Late" answers the question this page exists
 * for — what will hurt if I leave it today — and it applies to paperwork and follow-ups
 * alike. Notifications have no deadline, so they are hidden under Late rather than
 * shown unfiltered beneath a filter that claims to have narrowed the page.
 *
 * Read/unread still exists where it means something: on the Notifications card, which
 * has Mark all read and Clear read of its own.
 */
type InboxFilter = "all" | "late";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const show: InboxFilter = (await searchParams).show === "late" ? "late" : "all";

  const [allNotifications, allFollowUps, allDocs] = await Promise.all([
    listNotifications(me.id),
    listFollowUps(me, 200),
    listDocumentsDue(me),
  ]);

  const lateDocs = allDocs.filter((d) => d.daysUntilDue < 0);
  const lateFollowUps = allFollowUps.filter((f) => f.overdue);
  const lateCount = lateDocs.length + lateFollowUps.length;

  const docs = show === "late" ? lateDocs : allDocs;
  const followUps = show === "late" ? lateFollowUps : allFollowUps;
  const notifications = show === "late" ? [] : allNotifications;

  const overdue = lateFollowUps.length;
  const docsOverdue = lateDocs.length;
  const nothing = notifications.length === 0 && followUps.length === 0 && docs.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Inbox</h1>
          {/* One clause, no counts: every number here is repeated on the card it
              belongs to, and saying "1 document overdue" twice on one screen teaches
              the eye that the second one is decoration. */}
          <p className="text-sm text-muted-foreground">
            {isTeamLeadOrAbove(me) ? "Everything open across the team." : "Everything waiting on you."}
          </p>
        </div>
        {/* Counts live on the tabs, which is where a count changes what you click. */}
        <Segmented
          items={[
            {
              href: "/inbox",
              label: "All",
              count: allDocs.length + allFollowUps.length + allNotifications.length,
              active: show === "all",
            },
            { href: "/inbox?show=late", label: "Late", count: lateCount, active: show === "late" },
          ]}
        />
      </div>

      {nothing && (
        /* Two different empties. "Nothing is late" after filtering is good news and
           needs a way back to the full list; "nothing at all" is the genuinely empty
           inbox and needs nothing but the sentence. */
        <EmptyState
          icon={InboxIcon}
          title={show === "late" ? "Nothing is late." : "Nothing needs you right now."}
          hint={
            show === "late"
              ? "No paperwork or follow-up has passed its date."
              : "Paperwork, follow-ups and notifications all appear here as they fall due."
          }
          action={
            show === "late" ? (
              <Link
                href="/inbox"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Show everything
              </Link>
            ) : undefined
          }
        />
      )}

      {/*
        Two columns from `lg`, and the split is by KIND OF ATTENTION rather than by
        size. Left is work you have to do — paperwork with a deadline, follow-ups you
        promised. Right is the record that something happened, which you read and move
        on from. Mixing them in one column made an agent scroll past a notification
        about a lead being passed on to reach a document that expires on Friday.

        Source order is unchanged, so a phone still stacks them in the order they
        matter: paperwork, follow-ups, then notifications. The grid only takes effect
        where there is width to use — on a laptop the right half of this page was
        empty while the left half scrolled.
      */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
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

        </div>

        <div className="space-y-4">
      {notifications.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent><InboxList items={notifications} /></CardContent>
        </Card>
      )}
        </div>
      </div>

    </div>
  );
}
