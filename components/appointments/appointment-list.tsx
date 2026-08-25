"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordAppointmentOutcome } from "@/server/appointments/actions";
import { APPOINTMENT_OUTCOME } from "@/lib/constants";
import type { AppointmentRow } from "@/server/appointments/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { appointmentStatusTone, appointmentOutcomeTone, humaniseSlug } from "@/lib/status";

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

/** One appointment, with the write-up form revealed on demand. */
function AppointmentCard({ v }: { v: AppointmentRow }) {
  const router = useRouter();
  const [writing, setWriting] = React.useState(false);
  const [outcome, setOutcome] = React.useState<string>("interested");
  const [remark, setRemark] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function save(status: "showed-up" | "no-show" | "cancelled") {
    setError(null);
    start(async () => {
      const res = await recordAppointmentOutcome({
        id: v.id,
        status,
        outcome: status === "showed-up" ? outcome : null,
        remark: remark || null,
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
            <Link href={v.subjectHref} className="font-medium hover:underline">
              {v.subjectTitle}
            </Link>
            {v.subjectKind === "project" && <Badge variant="outline">new launch</Badge>}
            <Badge className={appointmentStatusTone(v.status)}>{humaniseSlug(v.status)}</Badge>
            {v.outcome && (
              <Badge className={appointmentOutcomeTone(v.outcome)}>{humaniseSlug(v.outcome)}</Badge>
            )}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {timeFmt.format(v.scheduledAt)}
            {v.subjectDetail ? ` · ${v.subjectDetail}` : ""}
          </div>
          <div className="mt-1 text-sm">
            <Link href={v.clientHref} className="hover:underline">
              {v.clientName}
            </Link>
            {v.clientPhone ? <span className="text-muted-foreground"> · {v.clientPhone}</span> : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {v.setterName ? `Set by ${v.setterName}` : "Unassigned"}
            {/* Only worth naming a closer when it is not the setter closing their own. */}
            {v.closerName && v.closerName !== v.setterName ? ` · Closing: ${v.closerName}` : ""}
          </div>
          {v.remark && <p className="mt-1 text-sm">{v.remark}</p>}
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
            {APPOINTMENT_OUTCOME.map((o) => (
              <option key={o} value={o}>
                {humaniseSlug(o)}
              </option>
            ))}
          </Select>
          <Input
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="One line for the list — “Loved the corner unit, comparing loans”"
            maxLength={500}
          />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything longer worth keeping."
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => save("showed-up")}>
              {pending ? "Saving…" : "Showed up"}
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

export function AppointmentList({ items, empty }: { items: AppointmentRow[]; empty?: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty ?? "Nothing scheduled."}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((v) => (
        <AppointmentCard key={v.id} v={v} />
      ))}
    </ul>
  );
}
