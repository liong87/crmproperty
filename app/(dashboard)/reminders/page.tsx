import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listFollowUps } from "@/server/activities/queries";
import { listDocumentsDue } from "@/server/deal-documents/queries";
import { FollowUpList } from "@/components/activities/follow-up-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS } from "@/lib/chart-colors";

const dateFmt = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
});

export default async function RemindersPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const [items, docs] = await Promise.all([listFollowUps(me, 200), listDocumentsDue(me)]);
  const overdue = items.filter((i) => i.overdue).length;
  const docsOverdue = docs.filter((d) => d.daysUntilDue < 0).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">
          {isManagerOrAbove(me) ? "All open follow-ups across the team." : "Your open follow-ups."}
          {overdue > 0 && ` · ${overdue} overdue`}
        </p>
      </div>

      {/* Paperwork first: a follow-up call can slip a day, an expired loan approval
          cannot be un-expired. */}
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
                          : `${dateFmt.format(d.dueAt)}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <FollowUpList items={items} />
    </div>
  );
}
