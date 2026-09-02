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

  React.useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setRect({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 268) });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScroll = () => close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function close() { setOpen(false); setPicked(null); setBody(""); setError(null); }

  function save() {
    if (!picked) return;
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
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full transition-opacity hover:opacity-80"
      >
        <Badge className={leadStatusTone(status)}>{statusLabel(status)}</Badge>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menu}
            style={{ position: "fixed", top: rect.top, left: rect.left, width: 260 }}
            className="z-50 overflow-hidden rounded-xl border bg-card shadow-lg"
          >
            {!picked ? (
              <div role="listbox" className="max-h-72 overflow-y-auto p-1">
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
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", leadStatusTone(s.value))} />
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3">
                <p className="text-xs text-muted-foreground">
                  {leadName} &rarr;{" "}
                  <span className="font-semibold text-foreground">{statusLabel(picked)}</span>
                </p>
                <input
                  autoFocus
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); save(); }
                    if (e.key === "Escape") close();
                  }}
                  placeholder="What happened? (optional)"
                  className="mt-2 w-full border-0 border-b border-input bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                />
                {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
                <div className="mt-3 flex justify-end gap-1.5">
                  <button type="button" onClick={close}
                    className="rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-secondary">
                    Cancel
                  </button>
                  <button type="button" onClick={save} disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gradient px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                    {pending && <Loader2 className="h-3 w-3 animate-spin" />}
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
