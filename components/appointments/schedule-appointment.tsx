"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { scheduleAppointment } from "@/server/appointments/actions";
import type { PickableListing } from "@/server/matching/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { localInputToIso, formatMYR } from "@/lib/utils";

export interface PickableProject {
  id: string;
  name: string;
}

/**
 * Schedule an appointment from a client's page.
 *
 * An appointment is at EITHER a new-launch project's sales gallery or a resale
 * listing — the two are picked from one control, because to an agent it is one
 * question ("what are we showing them?") and offering two dropdowns invites filling
 * in both.
 *
 * Times are entered and interpreted as Malaysia time — `localInputToIso` handles the
 * conversion, the same helper the follow-up reminder uses. An appointment booked for
 * "3pm" must mean 3pm in Kuala Lumpur regardless of the device's clock.
 */
export function ScheduleAppointment({
  contactId,
  leadId,
  listings,
  projects,
  agents,
}: {
  contactId?: string;
  leadId?: string;
  listings: PickableListing[];
  projects: PickableProject[];
  /** Colleagues who can be handed the presentation. Empty hides the closer field. */
  agents?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // One value encoding both kind and id, e.g. "project:uuid" — see the note above.
  const [subject, setSubject] = React.useState("");
  const [closerId, setCloserId] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const nothingToShow = listings.length === 0 && projects.length === 0;

  function submit() {
    setError(null);
    const iso = localInputToIso(when);
    if (!subject) return setError("Choose a project or a listing.");
    if (!iso) return setError("Choose a date and time.");

    const [kind, id] = subject.split(":");
    start(async () => {
      const res = await scheduleAppointment({
        projectId: kind === "project" ? id : null,
        propertyId: kind === "property" ? id : null,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        closerId: closerId || null,
        scheduledAt: iso,
        notes: notes || null,
      });
      if (!res.success) return setError(res.error);
      setOpen(false);
      setSubject("");
      setCloserId("");
      setWhen("");
      setNotes("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} disabled={nothingToShow}>
        {nothingToShow ? "Nothing to show yet" : "Schedule appointment"}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="apptSubject">Project or listing</Label>
        <Select id="apptSubject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Choose…</option>
          {projects.length > 0 && (
            <optgroup label="New launch">
              {projects.map((p) => (
                <option key={p.id} value={`project:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          )}
          {listings.length > 0 && (
            <optgroup label="Resale listings">
              {listings.map((l) => (
                <option key={l.id} value={`property:${l.id}`}>
                  {l.title} — {l.area} · {formatMYR(l.askingPrice)}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apptWhen">Date and time</Label>
        <Input
          id="apptWhen"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Malaysia time.</p>
      </div>

      {agents && agents.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="apptCloser">Closer (optional)</Label>
          <Select id="apptCloser" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
            <option value="">I am closing this myself</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Who runs the presentation. Recorded now because commission splits on it.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="apptNotes">Notes (optional)</Label>
        <Textarea
          id="apptNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Meet at the sales gallery…"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Scheduling…" : "Schedule"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
