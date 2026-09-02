"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { setUserTeamLead } from "@/server/users/actions";
import { Select } from "@/components/ui/select";
import type { TeamMember } from "@/server/users/hierarchy";

/**
 * Who this person reports to.
 *
 * Saves on change rather than behind a button: it is one field, and a Save button that
 * governs a single select is a step that exists only to be forgotten.
 */
export function TeamLeadPicker({
  userId, current, leads, disabled,
}: {
  userId: string;
  current: string | null;
  leads: TeamMember[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(current ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    start(async () => {
      const res = await setUserTeamLead({ userId, teamLeadId: next || null });
      if (!res.success) {
        // Put the control back to what the database still says, so the screen never
        // shows a hierarchy that was rejected.
        setValue(previous);
        return setError(res.error ?? "Could not save.");
      }
      router.refresh();
    });
  }

  return (
    <div>
      <Select
        aria-label="Reports to"
        className="h-9 min-w-[10rem] text-sm"
        value={value}
        disabled={disabled || pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Nobody</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
