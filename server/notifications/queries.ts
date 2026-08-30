/** Reading a person's own notifications. Never anybody else's. */
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notifications, type Notification } from "@/lib/db/schema";

export async function listNotifications(
  userId: string,
  limit = 100,
): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.deletedAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}
