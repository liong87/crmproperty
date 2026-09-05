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
import { FormAlert } from "@/components/ui/alert";
import { Dialog } from "@/components/ui/dialog";
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
export interface SchedulingProps {
  contactId?: string;
  leadId?: string;
  listings: PickableListing[];
  projects: PickableProject[];
  /** Colleagues who can be handed the presentation. Empty hides the closer field. */
  agents?: { id: string; name: string }[];
}

/**
 * The fields, with no chrome of their own.
 *
 * Split out so the same form can be an inline panel on a client's page and a dialog
 * over a table row. Duplicating it was the alternative, and a scheduling form that
 * exists twice is a scheduling form that will disagree with itself.
 */
function SchedulingFields({
  contactId,
  leadId,
  listings,
  projects,
  agents,
  onDone,
  onCancel,
}: SchedulingProps & { onDone: () => void; onCancel: () => void }) {
  const router = useRouter();
  // One value encoding both kind and id, e.g. "project:uuid" — see the note above.
  const [subject, setSubject] = React.useState("");
  const [closerId, setCloserId] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

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
      setSubject("");
      setCloserId("");
      setWhen("");
      setNotes("");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-3">
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

      {error && <FormAlert>{error}</FormAlert>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Scheduling…" : "Schedule"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** True when there is nothing an appointment could be against. */
const nothingToShow = (p: SchedulingProps) =>
  p.listings.length === 0 && p.projects.length === 0;

/**
 * The inline panel, as it has always appeared on a lead's and a contact's page.
 */
export function ScheduleAppointment(props: SchedulingProps) {
  const [open, setOpen] = React.useState(false);
  const empty = nothingToShow(props);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} disabled={empty}>
        {empty ? "Nothing to show yet" : "Schedule appointment"}
      </Button>
    );
  }
  return (
    <div className="rounded-lg border p-3">
      <SchedulingFields {...props} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
    </div>
  );
}

/**
 * The same form in a dialog, for a table row.
 *
 * Booking a viewing is the commonest thing an agent does to a lead, and it cost three
 * navigations: open the lead, scroll to the panel, come back to the list to do the
 * next one. From the row it is one click and the list is still underneath.
 *
 * Controlled by the caller rather than owning a trigger: the row already has a button
 * strip, and a second component drawing its own button there would not line up with
 * the others.
 */
export function ScheduleAppointmentDialog({
  open,
  onClose,
  clientName,
  ...props
}: SchedulingProps & { open: boolean; onClose: () => void; clientName: string }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Schedule appointment — ${clientName}`}
      description={
        nothingToShow(props)
          ? "There are no projects or listings to show yet."
          : "Malaysia time. The lead moves to Appointment once this is saved."
      }
    >
      {nothingToShow(props) ? (
        <Button variant="ghost" onClick={onClose}>Close</Button>
      ) : (
        <SchedulingFields {...props} onDone={onClose} onCancel={onClose} />
      )}
    </Dialog>
  );
}
