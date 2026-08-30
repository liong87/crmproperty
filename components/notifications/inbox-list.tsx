"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllRead, markRead } from "@/server/notifications/actions";
import type { Notification } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const KIND_LABEL: Record<string, string> = {
  "lead-passed-on": "Lead passed on",
  "lead-assigned": "New lead",
  "document-due": "Paperwork",
  "appointment-reminder": "Appointment",
  digest: "Weekly summary",
};

/** Relative time, coarse on purpose — a notification is not a stopwatch. */
function ago(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function InboxList({ items }: { items: Notification[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const unread = items.filter((n) => !n.readAt).length;

  function run(fn: () => Promise<{ success: boolean }>) {
    start(async () => {
      await fn();
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing here. You will be told when a lead is passed to you, when paperwork falls
        due, and before an appointment.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{unread} unread</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(markAllRead)}>
            Mark all read
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {items.map((n) => {
          const body = (
            <div className="flex items-start gap-3">
              {/* Unread is a dot, not a colour wash — the list stays readable when
                  everything is unread, which is the normal Monday state. */}
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-primary"}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className={n.readAt ? "font-medium text-muted-foreground" : "font-medium"}>
                    {n.title}
                  </span>
                  <Badge variant="outline">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                  <span className="text-xs text-muted-foreground">{ago(n.createdAt)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
              </div>
            </div>
          );

          return (
            <li key={n.id} className="rounded-lg border p-3">
              {n.link ? (
                <Link
                  href={n.link}
                  className="block"
                  onClick={() => { if (!n.readAt) void markRead(n.id); }}
                >
                  {body}
                </Link>
              ) : (
                body
              )}
              {!n.readAt && (
                <div className="mt-2">
                  <Button size="sm" variant="ghost" disabled={pending}
                    onClick={() => run(() => markRead(n.id))}>
                    Mark read
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
