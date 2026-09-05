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
import { cn } from "@/lib/utils";
import { Segmented, FilterChip } from "@/components/ui/segmented";
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

/**
 * How the paperwork groups are ordered.
 *
 * Three axes, and NOT a reverse-date toggle. Outlook offers ascending/descending
 * because for mail both directions are legitimate; in a work queue "latest first" puts
 * the thing about to expire at the bottom, so the only function of that control is to
 * hide it. These three each answer a different question instead:
 *
 *   due    — what is most urgent (the default, and right almost always)
 *   count  — who is furthest behind, which urgency cannot tell you: one deal with a
 *            single late document is not the same problem as one with nine outstanding
 *   client — where is the name I am looking for, when scrolling beats searching
 */
type PaperworkSort = "due" | "client" | "newest";

/*
 * Two options, and there were three.
 *
 * The third sorted by how many documents a deal still owed — first called "Most
 * outstanding", then "Most documents", and confusing under both names. The naming was
 * a symptom: the control was redundant. Every group header already prints "10
 * outstanding", so the count you would sort by is on screen before you sort, and the
 * overdue pill already picks out the ones that hurt. A control that reorders by a
 * number the reader can already see earns nothing and costs a decision.
 *
 * What is left explains itself without a tooltip, which is the bar a label has to
 * clear.
 */
const SORT_LABEL: Record<PaperworkSort, string> = {
  due: "Soonest due",
  client: "Client A–Z",
  /* Newest lead first: the deal's own created date, not the document's. An agent
     chasing a fresh booking wants it at the top even when nothing in it is late yet. */
  newest: "Newest lead",
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; sort?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const sp = await searchParams;
  const show: InboxFilter = sp.show === "late" ? "late" : "all";
  const sort: PaperworkSort =
    sp.sort === "client" ? "client" : sp.sort === "newest" ? "newest" : "due";

  /** Keep whichever control you are NOT touching. Both live in the URL, so a filtered,
   *  sorted inbox is a link somebody can send to a colleague. */
  const hrefWith = (over: { show?: InboxFilter; sort?: PaperworkSort }) => {
    const next = new URLSearchParams();
    const s2 = over.show ?? show;
    const o2 = over.sort ?? sort;
    if (s2 !== "all") next.set("show", s2);
    if (o2 !== "due") next.set("sort", o2);
    const qs = next.toString();
    return `/inbox${qs ? `?${qs}` : ""}`;
  };

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

  /** Is there anything for the right-hand column to hold? */
  const hasRecord = notifications.length > 0;

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
              href: hrefWith({ show: "all" }),
              label: "All",
              count: allDocs.length + allFollowUps.length + allNotifications.length,
              active: show === "all",
            },
            { href: hrefWith({ show: "late" }), label: "Late", count: lateCount, active: show === "late" },
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
      {/*
        The split only happens when there is something to split.

        Two columns are right when both are occupied — work on the left, the record of
        what happened on the right. With no notifications the right column is empty and
        the paperwork card was squeezed into two thirds of the page for nothing, which
        made a card holding one collapsed row look like a fragment floating in white
        space. Empty right column, full width for the work.
      */}
      <div className={cn("grid grid-cols-1 items-start gap-4", hasRecord && "lg:grid-cols-3")}>
        <div className={cn("space-y-4", hasRecord && "lg:col-span-2")}>
      {docs.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Paperwork due</CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Next 14 days, plus anything already overdue
              {docsOverdue > 0 && ` · ${docsOverdue} overdue`}
            </p>
            {/*
              Always shown, and that is deliberate. It was gated on deal count twice —
              first at three, then at two — and both times the person looking for it saw
              nothing and assumed it was broken. A control that appears and disappears
              depending on how much data you happen to have is worse than one that is
              occasionally redundant: predictable beats tidy. With a single deal the sort
              simply has nothing to reorder, which costs one line of screen and no
              confusion.

              Chips rather than a second Segmented: the All/Late tabs own the loud
              treatment, and two gradient controls compete for the same glance.
            */}
            <div role="group" aria-label="Sort paperwork" className="flex flex-wrap items-center gap-1.5 pt-1">
              {(Object.keys(SORT_LABEL) as PaperworkSort[]).map((k) => (
                <FilterChip
                  key={k}
                  href={hrefWith({ sort: k })}
                  label={SORT_LABEL[k]}
                  active={sort === k}
                />
              ))}
            </div>
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
              )
                .sort((a, b) => {
                  if (sort === "client") return a[0]!.contactName.localeCompare(b[0]!.contactName);
                  if (sort === "newest")
                    return b[0]!.dealCreatedAt.getTime() - a[0]!.dealCreatedAt.getTime();
                  // Soonest due: compare each deal by its most urgent document, not by
                  // its first — a deal whose second item is overdue outranks one whose
                  // first is due next week.
                  const soonest = (g: typeof docs) => Math.min(...g.map((d) => d.daysUntilDue));
                  return soonest(a) - soonest(b);
                })
                .map((group) => {
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
                          {/*
                            PLAIN TEXT, NOT A LINK — a <summary> is itself a control,
                            and a link inside one is a control inside a control: axe
                            flags it "nested-interactive", and in practice a keyboard
                            user tabs onto the link, presses Enter expecting to expand
                            the row, and is navigated away instead. The link to the deal
                            lives in the expanded panel below, where it can be reached
                            without ambiguity.
                          */}
                          <span className="truncate font-medium">{first.contactName}</span>
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
                          <span className="text-[13px] tabular-nums text-muted-foreground">
                            {group.length} outstanding
                          </span>
                        </span>
                        {/* The one number that decides whether this row needs you today. */}
                        {overdueCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-[13px] font-semibold tabular-nums text-destructive-ink">
                            {overdueCount} overdue
                          </span>
                        ) : (
                          <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
                            {soonest.daysUntilDue === 0 ? "Due today" : dateFmt.format(soonest.dueAt)}
                          </span>
                        )}
                      </summary>

                      <ul className="pb-1 pl-12 pr-5">
                        {group.map((d) => {
                          const late = d.daysUntilDue < 0;
                          return (
                            <li
                              key={d.id}
                              /* 15px, not 14. This is a reading list, not a data
                                 table — the density argument that justifies small type
                                 in the leads grid does not apply to ten rows with a
                                 whole card to themselves. */
                              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-[15px]"
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
                                    ? "shrink-0 text-[13px] font-semibold tabular-nums text-destructive-ink"
                                    : "shrink-0 text-[13px] tabular-nums text-muted-foreground"
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

                      {/* The way through to the deal, now that the heading is not a
                          link. Inside the disclosure, so it is only reachable once the
                          row is open — the same place the documents themselves are. */}
                      <p className="pb-3 pl-12 pr-5">
                        <Link
                          href={`/deals/${first.dealId}`}
                          className="text-[13px] font-medium text-primary underline underline-offset-4"
                        >
                          Open {first.contactName}&rsquo;s deal
                        </Link>
                      </p>
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
