"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeFollowUp } from "@/server/activities/actions";
import type { FollowUp } from "@/server/activities/queries";
import { Badge } from "@/components/ui/badge";

function fmt(d: Date | string) {
  return new Date(d).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
}

export function FollowUpList({ items }: { items: FollowUp[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  if (items.length === 0) return <p className="text-sm text-muted-foreground">No open follow-ups. 🎉</p>;

  return (
    <ul className="space-y-2">
      {items.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
          <div className="min-w-0">
            <Link href={f.entityHref} className="font-medium hover:underline">{f.entityLabel}</Link>
            {f.body && <p className="truncate text-muted-foreground">{f.body}</p>}
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={f.overdue ? "destructive" : "default"}>{f.overdue ? "Overdue" : "Due"} {fmt(f.followUpAt)}</Badge>
              <Badge variant="secondary">{f.type}</Badge>
            </div>
          </div>
          <button className="shrink-0 text-xs underline" disabled={pending}
            onClick={() => start(async () => { await completeFollowUp(f.id); router.refresh(); })}>
            Mark done
          </button>
        </li>
      ))}
    </ul>
  );
}
