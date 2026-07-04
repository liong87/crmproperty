import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listFollowUps } from "@/server/activities/queries";
import { FollowUpList } from "@/components/activities/follow-up-list";

export default async function RemindersPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  const items = await listFollowUps(me);
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Reminders</h1>
        <p className="text-sm text-muted-foreground">
          {isManagerOrAbove(me) ? "All open follow-ups across the team." : "Your open follow-ups."}
          {overdue > 0 && ` · ${overdue} overdue`}
        </p>
      </div>
      <FollowUpList items={items} />
    </div>
  );
}
