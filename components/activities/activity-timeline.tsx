"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { completeFollowUp, deleteActivity } from "@/server/activities/actions";
import type { TimelineItem } from "@/server/activities/queries";
import { Badge } from "@/components/ui/badge";

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
}

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const open = a.followUpAt && !a.followUpDoneAt;
        const overdue = open && new Date(a.followUpAt as Date).getTime() < Date.now();
        return (
          <li key={a.id} className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{a.type}</Badge>
                {a.createdByName && <span className="text-xs text-muted-foreground">{a.createdByName}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{fmt(a.occurredAt)}</span>
            </div>
            {a.body && <p className="mt-1 whitespace-pre-wrap">{a.body}</p>}
            {a.followUpAt && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge variant={a.followUpDoneAt ? "outline" : overdue ? "destructive" : "default"}>
                  {a.followUpDoneAt ? "Follow-up done" : `Follow-up ${fmt(a.followUpAt)}`}
                </Badge>
                {open && (
                  <button className="underline" disabled={pending}
                    onClick={() => start(async () => { await completeFollowUp(a.id); router.refresh(); })}>
                    Mark done
                  </button>
                )}
                <button className="text-destructive underline" disabled={pending}
                  onClick={() => start(async () => { await deleteActivity(a.id); router.refresh(); })}>
                  Delete
                </button>
              </div>
            )}
            {!a.followUpAt && (
              <button className="mt-2 text-xs text-destructive underline" disabled={pending}
                onClick={() => start(async () => { await deleteActivity(a.id); router.refresh(); })}>
                Delete
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
