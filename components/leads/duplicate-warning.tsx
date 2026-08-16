"use client";
import * as React from "react";
import { findDuplicateClients, type DuplicateHit } from "@/server/duplicates/queries";

/**
 * Live duplicate check while an agent fills in a phone or email.
 *
 * Warns, never blocks. Genuine duplicates happen — a couple sharing a phone, a client
 * who really did enquire twice, a family using one email — and an agent with a
 * legitimate case should not have to find a manager to save a record.
 *
 * Debounced, because this fires on every keystroke of a phone field.
 */
export function DuplicateWarning({
  phone,
  email,
  excludeLeadId,
  excludeContactId,
}: {
  phone: string;
  email: string;
  excludeLeadId?: string;
  excludeContactId?: string;
}) {
  const [hits, setHits] = React.useState<DuplicateHit[]>([]);

  React.useEffect(() => {
    const p = phone.trim();
    const e = email.trim();
    // A partial phone number matches nothing useful; wait until it looks complete.
    if (p.length < 8 && !e.includes("@")) {
      setHits([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await findDuplicateClients({
          phone: p || null,
          email: e || null,
          excludeLeadId,
          excludeContactId,
        });
        if (!cancelled) setHits(found);
      } catch {
        // A failed check must never get in the way of saving a lead.
        if (!cancelled) setHits([]);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, email, excludeLeadId, excludeContactId]);

  if (hits.length === 0) return null;

  // Someone else's record is the case worth flagging loudly; your own is just a
  // reminder that you already have them.
  const conflict = hits.find((h) => !h.isMine);
  const mine = hits.find((h) => h.isMine);

  if (conflict) {
    return (
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">This person may already be in the CRM.</p>
        <p className="mt-1">
          A {conflict.kind} with the same {conflict.matchedOn} is assigned to{" "}
          <span className="font-medium">{conflict.ownerName}</span>. Speak to them before
          working this client — you can still save if it is genuinely someone else.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
      You already have a {mine!.kind} with this {mine!.matchedOn}.
    </div>
  );
}
