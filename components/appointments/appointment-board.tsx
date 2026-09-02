"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { GripVertical, Loader2 } from "lucide-react";
import { moveAppointmentToColumn } from "@/server/appointments/actions";
import type { AppointmentRow } from "@/server/appointments/queries";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  weekday: "short", day: "numeric", month: "short",
  hour: "numeric", minute: "2-digit", hour12: true,
  timeZone: "Asia/Kuala_Lumpur",
});

/**
 * Column tints, one per stage.
 *
 * Full class strings, not built from a hue name: Tailwind scans source text, so
 * `bg-${hue}-50` compiles to nothing and the board silently renders untinted.
 *
 * Kept at /30 and /25 alphas deliberately. This should read as a wash noticed
 * peripherally, not a block of colour — the app is deep green and calm, and pasting a
 * competitor's full-strength palette over it would fight the identity rather than
 * help. Cancelled and Not interested take slate because they are archive, not
 * workflow.
 */
const COLUMN_TINT: Record<string, { shell: string; label: string }> = {
  scheduled: {
    shell: "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-900/20",
    label: "text-amber-700 dark:text-amber-400",
  },
  "showed-up": {
    shell: "border-orange-200 bg-orange-50/30 dark:border-orange-800 dark:bg-orange-900/20",
    label: "text-orange-700 dark:text-orange-400",
  },
  booked: {
    shell: "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-900/20",
    label: "text-emerald-700 dark:text-emerald-400",
  },
  "no-show": {
    shell: "border-rose-200 bg-rose-50/30 dark:border-rose-800 dark:bg-rose-900/20",
    label: "text-rose-700 dark:text-rose-400",
  },
  "not-interested": {
    shell: "border-slate-200 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-800/30",
    label: "text-slate-600 dark:text-slate-400",
  },
  cancelled: {
    shell: "border-slate-200 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-800/30",
    label: "text-slate-600 dark:text-slate-400",
  },
};

/** Archive rather than workflow — folded away until somebody goes looking. */
const COLLAPSED_BY_DEFAULT = new Set(["not-interested", "cancelled"]);

/**
 * The card banner encodes TIME, not stage — the stage is already the column it sits
 * in, so colouring the banner by stage would say the same thing twice.
 *
 * This is the highest-value detail on the board: an agent glancing at Scheduled sees
 * what is urgent without reading a single date.
 */
export function bannerTone(a: { scheduledAt: Date; status: string }): string {
  const days = (a.scheduledAt.getTime() - Date.now()) / 86_400_000;
  if (a.status === "scheduled" && days < 0) {
    return "bg-rose-100 text-rose-700 dark:bg-rose-500/25 dark:text-rose-200";
  }
  if (days < 1) return "bg-amber-100 text-amber-800 dark:bg-amber-500/25 dark:text-amber-100";
  if (days < 4) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200";
  return "bg-slate-100 text-slate-600 dark:bg-slate-500/25 dark:text-slate-200";
}

/** A person's name, marked when it is the viewer. Unassigned is stated, not blank. */
function who(name: string | null, id: string | null, meId: string): string {
  if (!name) return "Unassigned";
  return id === meId ? `${name} (You)` : name;
}

export interface BoardColumnData {
  key: string;
  label: string;
  items: AppointmentRow[];
}

/**
 * The appointment board, draggable.
 *
 * Dragging routes through moveAppointmentToColumn, which wraps recordAppointmentOutcome
 * — so a card dropped on "No show" writes the same timeline entry and closes the same
 * reminder as recording it on the form. Two write paths for one fact is how the quiet
 * one drifts.
 *
 * TOUCH. HTML5 drag and drop does not exist on a phone, and phones are where agents
 * work. Every card therefore also carries a "Move to" select, which is not a
 * consolation prize — it is the primary control on small screens and the keyboard path
 * on large ones. The drag is the enhancement.
 *
 * Optimistic, with a revert. A drag that shows nothing for 400ms reads as broken, so
 * the card moves at once and goes back if the server refuses.
 */
export function AppointmentBoard({
  columns, meId,
}: {
  columns: BoardColumnData[];
  /** Whose board this is, so the card can say "(You)" rather than repeating a name. */
  meId: string;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState(columns);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Server data wins whenever it arrives — otherwise a refresh elsewhere in the page
  // would leave this board showing a state nobody has any more.
  React.useEffect(() => setLocal(columns), [columns]);

  function move(id: string, toKey: string) {
    const from = local.find((c) => c.items.some((i) => i.id === id));
    if (!from || from.key === toKey) return;
    const card = from.items.find((i) => i.id === id);
    if (!card) return;

    const before = local;
    setLocal((cols) =>
      cols.map((c) =>
        c.key === from.key
          ? { ...c, items: c.items.filter((i) => i.id !== id) }
          : c.key === toKey
            ? { ...c, items: [card, ...c.items] }
            : c,
      ),
    );
    setBusy(id);
    setError(null);

    void (async () => {
      const res = await moveAppointmentToColumn({ id, column: toKey });
      setBusy(null);
      if (!res.success) {
        setLocal(before);
        setError(res.error ?? "Could not move that appointment.");
        return;
      }
      // Refresh so the no-show rate and the counts above the board follow the card.
      router.refresh();
    })();
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {local.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.key);
            }}
            onDragLeave={() => setOver((k) => (k === col.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) move(id, col.key);
            }}
            className={cn(
              "flex w-80 shrink-0 flex-col rounded-2xl border transition-all duration-150",
              COLUMN_TINT[col.key]?.shell ?? "border-gray-100 bg-muted/40",
              over === col.key && "ring-2 ring-primary/40",
            )}
          >
            <div className="flex items-center justify-between border-b border-white/60 px-3 py-2.5 dark:border-gray-700/60">
              <span className={cn("text-[10px] font-bold uppercase tracking-wide", COLUMN_TINT[col.key]?.label)}>
                {col.label}
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {col.items.length}
              </span>
            </div>

            <div className="p-2">
            {col.items.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Empty
              </div>
            ) : (
              <ul className="space-y-2">
                {col.items.map((a) => (
                  <li
                    key={a.id}
                    draggable={!busy}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", a.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(a.id);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={cn(
                      "group overflow-hidden rounded-2xl border border-gray-100 bg-card shadow-sm transition-all hover:border-gray-200 hover:shadow-md dark:border-gray-800",
                      "cursor-grab select-none active:cursor-grabbing",
                      dragging === a.id && "opacity-40",
                      busy === a.id && "opacity-60",
                    )}
                  >
                    {/* Time-coded banner. Hue = urgency, never stage. */}
                    <div className={cn("px-3 py-2", bannerTone(a))}>
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold leading-tight">
                          <span className="truncate opacity-90">{a.subjectTitle}</span>
                        </div>
                        <span className="shrink-0 text-[11px] font-semibold tabular-nums">
                          {timeFmt.format(a.scheduledAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 p-3">
                      <GripVertical
                        className="mt-0.5 hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 sm:block"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <Link href={a.clientHref} className="block truncate text-[13px] font-bold leading-tight hover:underline">
                          {a.clientName}
                        </Link>
                        <a
                          href={`https://wa.me/${a.clientPhone.replace(/\D/g, "")}`}
                          target="_blank" rel="noopener noreferrer"
                          className="block truncate text-[11px] font-semibold tabular-nums text-muted-foreground hover:text-foreground"
                        >
                          {a.clientPhone}
                        </a>
                        {/*
                          WHO RUNS THIS, ALWAYS SHOWN — not only when a separate closer
                          was named. Setter and closer are the two parties a commission
                          splits between, so "who was on this" is the fact a dispute
                          turns on, and it must be readable from the board rather than
                          reconstructed from a timeline afterwards. It matters MORE once
                          a lead can be shared outside the team, not less.

                          Both are shown when they differ; one line when the setter is
                          closing it themselves, which is the common case and does not
                          need two rows to say so.
                        */}
                        <p className="mt-1.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">
                          {a.closerId && a.closerId !== a.setterId ? "Setter / Closer" : "Closer"}
                        </p>
                        <p className="truncate text-[11px]">
                          {a.closerId && a.closerId !== a.setterId ? (
                            <>
                              <span className="text-muted-foreground">{who(a.setterName, a.setterId, meId)}</span>
                              <span className="mx-1 opacity-50">&rarr;</span>
                              <span className="font-medium">{who(a.closerName, a.closerId, meId)}</span>
                            </>
                          ) : (
                            <span className="font-medium">
                              {who(a.closerName ?? a.setterName, a.closerId ?? a.setterId, meId)}
                            </span>
                          )}
                        </p>
                      </div>
                      {busy === a.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                    </div>

                    <Select
                      aria-label={`Move ${a.clientName}'s appointment`}
                      className="mx-3 mb-3 h-8 w-[calc(100%-1.5rem)] text-xs opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      value={col.key}
                      disabled={busy === a.id}
                      onChange={(e) => move(a.id, e.target.value)}
                    >
                      {local.map((c) => (
                        <option key={c.key} value={c.key}>Move to: {c.label}</option>
                      ))}
                    </Select>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a card between columns, or use its dropdown. Moving a card to Showed up, No
        show or Cancelled records the outcome and writes it to the client&rsquo;s timeline,
        exactly as the write-up form does.
      </p>
    </div>
  );
}
