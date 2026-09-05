"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { coBrokeLead } from "@/server/leads/co-broke-lead";
import type { AssignableUser } from "@/server/users/queries";

/**
 * Co-broke this lead with a colleague: they work it, you keep the setter's claim.
 *
 * The label is "Co-broke" and not "Hand over" because that is the word the agency
 * actually uses, and a control named in the vocabulary of the trade needs no
 * explaining. "Hand over" also described the wrong thing — it sounds like giving a
 * lead away, which is precisely what this is not.
 *
 * Collapsed to a single quiet button until pressed, because on a queue card the two
 * actions that matter are Called and WhatsApp — a permanently open agent picker beside
 * them competes with the work.
 *
 * It says what happens to the commission, in the control itself. An agent deciding
 * whether to give a lead away is deciding about money, and a feature whose whole
 * purpose is "you keep a share" fails if that promise lives only in a help page.
 */
export function CoBrokeButton({
  leadId,
  leadName,
  colleagues,
}: {
  leadId: string;
  leadName: string;
  colleagues: AssignableUser[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Nobody to hand it to: one-person agency, or every colleague is inactive.
  if (colleagues.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <UserPlus className="h-4 w-4" />
        Co-broke
      </button>
    );
  }

  function submit() {
    if (!to) return;
    setError(null);
    start(async () => {
      const res = await coBrokeLead({ leadId, toUserId: to, note: note.trim() || null });
      if (!res.success) return setError(res.error ?? "Could not co-broke this lead.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/40 p-2">
      <label className="block text-xs font-medium" htmlFor={`co-broke-${leadId}`}>
        Co-broke {leadName} with
      </label>
      <select
        id={`co-broke-${leadId}`}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-11 w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="">Choose a colleague…</option>
        {colleagues.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why, in a few words (optional)"
        maxLength={500}
        className="h-11 w-full rounded-md border bg-background px-2 text-sm"
      />

      <p className="text-xs text-muted-foreground">
        They take over the follow-ups. You stay the setter, so a commission on this lead
        still splits with you.
      </p>

      {error && <p className="text-xs text-destructive-ink">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!to || pending}
          className="inline-flex h-11 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Co-broke
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="h-11 rounded-md px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
