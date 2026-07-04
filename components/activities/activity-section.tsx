import { listActivitiesForEntity } from "@/server/activities/queries";
import type { EntityType } from "@/server/activities/entity";
import { AddActivity } from "./add-activity";
import { ActivityTimeline } from "./activity-timeline";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/** Server component: activity timeline + logger for any entity. */
export async function ActivitySection({
  entityType,
  entityId,
  canLog = true,
}: {
  entityType: EntityType;
  entityId: string;
  canLog?: boolean;
}) {
  const items = await listActivitiesForEntity(entityType, entityId);
  return (
    <Card>
      <CardHeader><CardTitle>Activity &amp; Notes</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {canLog && <AddActivity entityType={entityType} entityId={entityId} />}
        <ActivityTimeline items={items} />
      </CardContent>
    </Card>
  );
}
