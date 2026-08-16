"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordViewingOutcome } from "@/server/viewings/actions";
import { VIEWING_OUTCOME } from "@/lib/constants";
import type { ViewingRow } from "@/server/viewings/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Malaysia time, whatever the device is set to — agents book in local time. */
const timeFmt = new Intl.DateTimeFormat("en-MY", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kuala_Lumpur",
});

function statusTone(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    case "no-show":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-secondary text-foreground";
  }
}

function humanise(s: string): string {
  return s.replace(/-/g, " ");
}

/** One viewing, with the write-up form revealed on demand. */
function ViewingCard({ v }: { v: ViewingRow }) {
  const router = useRouter();
  const [writing, setWriting] = React.useState(false);
  const [outcome, setOutcome] = React.useState<string>("interested");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function save(status: "completed" | "no-show" | "cancelled") {
    setError(null);
    start(async () => {
      const res = await recordViewingOutcome({
        id: v.id,
        status,
        outcome: status === "completed" ? outcome : null,
        notes: notes || null,
      });
      if (!res.success) return setError(res.error);
      setWriting(false);
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/properties/${v.propertyId}`} className="font-medium hover:underline">
              {v.propertyTitle}
            </Link>
            <Badge className={statusTone(v.status)}>{humanise(v.status)}</Badge>
            {v.outcome && <Badge variant="outline">{humanise(v.outcome)}</Badge>}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {timeFmt.format(v.scheduledAt)}
            {v.propertyArea ? ` · ${v.propertyArea}` : ""}
          </div>
          <div className="mt-1 text-sm">
            <Link href={v.clientHref} className="hover:underline">
              {v.clientName}
            </Link>
            {v.clientPhone ? <span className="text-muted-foreground"> · {v.clientPhone}</span> : null}
            {v.agentName ? <span className="text-muted-foreground"> · {v.agentName}</span> : null}
          </div>
          {v.notes && <p className="mt-1 text-sm text-muted-foreground">{v.notes}</p>}
        </div>

        {v.status === "scheduled" && !writing && (
          <Button size="sm" variant={v.needsOutcome ? "default" : "outline"} onClick={() => setWriting(true)}>
            {v.needsOutcome ? "Record outcome" : "Update"}
          </Button>
        )}
      </div>

      {writing && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome">
            {VIEWING_OUTCOME.map((o) => (
              <option key={o} value={o}>
                {humanise(o)}
              </option>
            ))}
          </Select>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did they say?"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => save("completed")}>
              {pending ? "Saving…" : "Viewing happened"}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save("no-show")}>
              No show
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => save("cancelled")}>
              Cancelled
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setWriting(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function ViewingList({ items, empty }: { items: ViewingRow[]; empty?: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty ?? "Nothing scheduled."}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((v) => (
        <ViewingCard key={v.id} v={v} />
      ))}
    </ul>
  );
}
