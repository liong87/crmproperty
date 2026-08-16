import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import { listGroupedViewings } from "@/server/viewings/queries";
import { ViewingList } from "@/components/viewings/viewing-list";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The agent's diary.
 *
 * Grouped rather than a calendar grid: agents read this on a phone between
 * appointments, where a scannable list beats a month view. "Needs writing up" comes
 * first because it is the only group with an action outstanding.
 */
export default async function ViewingsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const g = await listGroupedViewings(me);
  const total = g.overdue.length + g.today.length + g.tomorrow.length + g.upcoming.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Viewings</h1>
        <p className="text-sm text-muted-foreground">
          {g.scope === "team" ? "All viewings across the team." : "Your viewings."}
          {g.overdue.length > 0 && ` · ${g.overdue.length} to write up`}
        </p>
      </div>

      {total === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No viewings scheduled"
          hint="Schedule one from a lead or contact, once you have a listing to show."
        />
      ) : (
        <div className="space-y-4">
          {g.overdue.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle className="text-amber-900">Needs writing up</CardTitle>
              </CardHeader>
              <CardContent>
                <ViewingList items={g.overdue} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Today</CardTitle></CardHeader>
            <CardContent>
              <ViewingList items={g.today} empty="Nothing else today." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tomorrow</CardTitle></CardHeader>
            <CardContent>
              <ViewingList items={g.tomorrow} empty="Nothing tomorrow." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Later</CardTitle></CardHeader>
            <CardContent>
              <ViewingList items={g.upcoming} empty="Nothing further ahead." />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
