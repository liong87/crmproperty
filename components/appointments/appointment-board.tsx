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
export function AppointmentBoard({ columns }: { columns: BoardColumnData[] }) {
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
              "w-80 shrink-0 rounded-lg p-2 transition-colors",
              over === col.key ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-sm font-medium">{col.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{col.items.length}</span>
            </div>

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
                      "rounded-lg border bg-card p-3 shadow-sm transition-opacity",
                      dragging === a.id && "opacity-40",
                      busy === a.id && "opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical
                        className="mt-0.5 hidden h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 sm:block"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <Link href={a.clientHref} className="block truncate font-medium hover:underline">
                          {a.clientName}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{a.subjectTitle}</p>
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {timeFmt.format(a.scheduledAt)}
                        </p>
                        {a.closerName && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Closer: {a.closerName}
                          </p>
                        )}
                      </div>
                      {busy === a.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
                    </div>

                    <Select
                      aria-label={`Move ${a.clientName}'s appointment`}
                      className="mt-2 h-8 text-xs"
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
