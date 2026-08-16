"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { scheduleViewing } from "@/server/viewings/actions";
import type { PickableListing } from "@/server/matching/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { localInputToIso, formatMYR } from "@/lib/utils";

/**
 * Schedule a viewing from a client's page.
 *
 * Times are entered and interpreted as Malaysia time — `localInputToIso` handles the
 * conversion, the same helper the follow-up reminder uses. A viewing booked for
 * "3pm" must mean 3pm in Kuala Lumpur regardless of the device's clock.
 */
export function ScheduleViewing({
  contactId,
  leadId,
  listings,
}: {
  contactId?: string;
  leadId?: string;
  listings: PickableListing[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [propertyId, setPropertyId] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit() {
    setError(null);
    const iso = localInputToIso(when);
    if (!propertyId) return setError("Choose a property.");
    if (!iso) return setError("Choose a date and time.");

    start(async () => {
      const res = await scheduleViewing({
        propertyId,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        scheduledAt: iso,
        notes: notes || null,
      });
      if (!res.success) return setError(res.error);
      setOpen(false);
      setPropertyId("");
      setWhen("");
      setNotes("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} disabled={listings.length === 0}>
        {listings.length === 0 ? "No listings to view yet" : "Schedule viewing"}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="viewProperty">Property</Label>
        <Select
          id="viewProperty"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
        >
          <option value="">Choose a listing…</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title} — {l.area} · {formatMYR(l.askingPrice)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="viewWhen">Date and time</Label>
        <Input
          id="viewWhen"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Malaysia time.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="viewNotes">Notes (optional)</Label>
        <Textarea
          id="viewNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Meet at the guardhouse…"
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
