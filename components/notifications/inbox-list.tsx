"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  markAllRead,
  markRead,
  dismissNotification,
  clearReadNotifications,
} from "@/server/notifications/actions";
import type { Notification } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert, LiveStatus } from "@/components/ui/alert";

const KIND_LABEL: Record<string, string> = {
  "lead-passed-on": "Lead passed on",
  "lead-co-broked": "Co-broke",
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
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const unread = items.filter((n) => !n.readAt).length;
  const read = items.length - unread;

  function run(fn: () => Promise<{ success: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) {
        setError(res.error ?? "That did not work. Try again.");
        return;
      }
      onOk?.();
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
      {error && <FormAlert>{error}</FormAlert>}
      {note && <LiveStatus>{note}</LiveStatus>}

      {/*
        Two different jobs, so two controls. "Mark all read" silences the dots and keeps
        the record on the page; "Clear read" takes the tidied ones off it. Clearing is
        confirmed because it acts on a set the reader cannot see the extent of at a
        glance; dismissing a single row is not, because a one-row mistake is obvious and
        the row is only soft-deleted anyway.
      */}
      {(unread > 0 || read > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} unread` : "All read"}
            {read > 0 && ` · ${read} read`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {unread > 0 && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(markAllRead)}>
                Mark all read
              </Button>
            )}
            {read > 0 && (
              <ConfirmButton
                variant="outline"
                size="sm"
                pending={pending}
                question={`Clear ${read} read notification${read === 1 ? "" : "s"}?`}
                confirmLabel="Clear"
                onConfirm={() =>
                  run(clearReadNotifications, () =>
                    setNote(`${read} read notification${read === 1 ? "" : "s"} cleared.`),
                  )
                }
              >
                Clear read
              </ConfirmButton>
            )}
          </div>
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
            <li key={n.id} className="group flex items-start gap-2 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
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
              </div>
              {/*
                Named after the notification it removes, so a screen reader hears
                "Dismiss Lead passed on — Farah Aziz" rather than the twentieth "Dismiss"
                on the page. Visible on focus as well as hover: a control that only
                appears under a pointer does not exist for a keyboard.
              */}
              <button
                type="button"
                disabled={pending}
                aria-label={`Dismiss "${n.title}"`}
                onClick={() => run(() => dismissNotification(n.id))}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 disabled:opacity-50 max-sm:opacity-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
