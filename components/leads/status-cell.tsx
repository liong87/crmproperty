"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { addRemark } from "@/server/leads/remarks";
import { LEAD_STATUS_META, statusLabel } from "@/lib/constants";
import { leadStatusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The status chip, editable in place — but never silently.
 *
 * Picking a status opens a one-line remark composer rather than saving immediately.
 * That is the rule the remark thread rests on: a lead cannot move without a reason
 * recorded, or the follow-up history stops being worth reading. Making the inline
 * control the one exception would have quietly undone it.
 *
 * Portalled, because the table wrapper has overflow-auto and would clip this.
 */
export function StatusCell({
  leadId, leadName, status,
}: {
  leadId: string; leadName: string; status: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<string | null>(null);
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rect, setRect] = React.useState<{ top: number; left: number } | null>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);
  const remarkId = React.useId();

  const place = React.useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 268) });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    /*
     * Scrolling REPOSITIONS the menu; it used to close it. The list is eleven statuses
     * long and the table scrolls under it, so the one gesture that lets you see the
     * option you are reaching for was also the gesture that slammed the menu shut.
     * Capture phase: it is the table that scrolls, not the window, and a bubbling
     * listener on window never hears that.
     */
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  function close() { setOpen(false); setPicked(null); setBody(""); setError(null); }

  /**
   * Closing on purpose — Escape, Cancel, or the chip itself — hands focus back to the
   * chip. Closing because of a click somewhere else must NOT: the click already has a
   * destination, and pulling focus away from it is worse than leaving it alone.
   */
  function dismiss() { close(); btn.current?.focus(); }

  function save() {
    if (!picked) return;
    // Enter held down fires repeatedly. Without this the lead gets two remarks and two
    // status changes from one keypress, and the thread reads as if it happened twice.
    if (pending) return;
    setPending(true);
    setError(null);
    void (async () => {
      const res = await addRemark({ leadId, body: body.trim() || null, status: picked });
      setPending(false);
      if (!res.success) return setError(res.error ?? "Could not save.");
      close();
      router.refresh();
    })();
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => (open ? dismiss() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
      >
        <Badge className={leadStatusTone(status)}>{statusLabel(status)}</Badge>
        <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 opacity-40" />
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menu}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: 260 }}
            className="z-50 overflow-hidden rounded-xl border bg-card shadow-lg"
          >
            {!picked ? (
              <div role="listbox" aria-label={`Status for ${leadName}`} className="max-h-72 overflow-y-auto p-1">
                {LEAD_STATUS_META.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="option"
                    aria-selected={s.value === status}
                    onClick={() => setPicked(s.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                      s.value === status && "font-semibold",
                    )}
                  >
                    {/* The tone belongs on a badge carrying the word, not on an 8px
                        dot: a colour with no text beside it is unreadable to anyone
                        who does not already know the palette. */}
                    <Badge className={leadStatusTone(s.value)}>{s.label}</Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs text-muted-foreground">
                  {leadName} &rarr;{" "}
                  <span className="font-semibold text-foreground">{statusLabel(picked)}</span>
                </p>
                {/* A placeholder is not a name: it disappears the moment you type, and
                    it is never read as the field's label. */}
                <label htmlFor={remarkId} className="sr-only">
                  What happened? Remark for {leadName} (optional)
                </label>
                <input
                  id={remarkId}
                  autoFocus
                  value={body}
                  disabled={pending}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); save(); }
                    if (e.key === "Escape") dismiss();
                  }}
                  placeholder="What happened? (optional)"
                  className="mt-2 w-full border-0 border-b border-input bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
                />
                {error && <p role="alert" className="mt-1.5 text-xs text-destructive-ink">{error}</p>}
                <div className="mt-3 flex justify-end gap-1.5">
                  <button type="button" onClick={dismiss} disabled={pending}
                    className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                    {pending && <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />}
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
