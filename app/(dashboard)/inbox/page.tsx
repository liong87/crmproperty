import { redirect } from "next/navigation";
import { getCurrentDbUser } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InboxList } from "@/components/notifications/inbox-list";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const items = await listNotifications(me.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Leads passed to you, paperwork falling due, and appointments coming up.
        </p>
      </div>
      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent><InboxList items={items} /></CardContent>
      </Card>
    </div>
  );
}
