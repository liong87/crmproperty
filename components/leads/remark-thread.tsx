"use client";
import * as React from "react";
import { Check, X, Loader2, MessageSquare } from "lucide-react";
import { addRemark } from "@/server/leads/remarks";
import { LEAD_STATUS_META, statusLabel } from "@/lib/constants";
import { leadStatusTone } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ThreadEntry {
  id: string;
  body: string | null;
  status: string | null;
  kind: string;
  authorName: string | null;
  createdAt: Date;
}

const stamp = (d: Date): string => {
  const day = new Intl.DateTimeFormat("en-MY", {
    day: "2-digit", month: "short", timeZone: "Asia/Kuala_Lumpur",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-MY", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur",
  }).format(d);
  const today = new Intl.DateTimeFormat("en-MY", {
    day: "2-digit", month: "short", timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  return `${day === today ? "Today" : day} · ${time.toLowerCase()}`;
};

/**
 * The remark thread: collapsed to its latest line, expanded in place.
 *
 * Expanding in place rather than in a modal is the point — an agent is scanning a list
 * and adding one line to one lead; a dialog would take over the screen for a sentence.
 *
 * The composer couples a status to the note deliberately. There is no way to change a
 * lead's status here without writing something, because a status that moved for
 * unrecorded reasons is exactly the gap that makes a follow-up history untrustworthy.
 */
export function RemarkThread({
  leadId, latest, latestAt, currentStatus, onSaved,
}: {
  leadId: string;
  latest: string | null;
  latestAt: Date | null;
  currentStatus: string;
  /** Called after a successful save so the parent can refresh. */
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [thread, setThread] = React.useState<ThreadEntry[]>([]);
  const [body, setBody] = React.useState("");
  const [status, setStatus] = React.useState(currentStatus);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const now = React.useRef(new Date());

  function save() {
    if (!body.trim() && status === currentStatus) {
      return setError("Write something, or change the status.");
    }
    setError(null);
    setPending(true);

    // Optimistic: the entry appears immediately, and on failure it is removed and the
    // typed text is put back. Never silently drop what somebody typed.
    const optimistic: ThreadEntry = {
      id: `tmp-${Date.now()}`, body: body.trim() || null,
      status: status === currentStatus ? null : status,
      kind: "manual", authorName: "You", createdAt: new Date(),
    };
    const typed = body;
    setThread((t) => [...t, optimistic]);
    setBody("");

    void (async () => {
      const res = await addRemark({
        leadId,
        body: typed.trim() || null,
        status: status === currentStatus ? null : status,
      });
      setPending(false);
      if (!res.success) {
        setThread((t) => t.filter((e) => e.id !== optimistic.id));
        setBody(typed);
        setError(res.error ?? "Could not save that remark.");
        return;
      }
      onSaved?.();
    })();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary"
      >
        {latestAt ? (
          <>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-primary">
              {stamp(latestAt)}
            </span>
            <span className="truncate text-xs text-muted-foreground">{latest}</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            No remarks yet. Log what happened on the call and it stays with this lead.
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-3">
      {(latestAt || thread.length > 0) && (
        <div className="max-h-[200px] space-y-1.5 overflow-y-auto pb-2">
          {latestAt && thread.length === 0 && (
            <Entry entry={{ id: "latest", body: latest, status: null, kind: "manual", authorName: null, createdAt: latestAt }} />
          )}
          {thread.map((e) => <Entry key={e.id} entry={e} />)}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        <span className="text-[11px] tabular-nums text-muted-foreground">{stamp(now.current)}</span>
        <Select
          aria-label="Outcome"
          className="h-8 w-auto min-w-[10rem] text-xs"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={pending}
        >
          {LEAD_STATUS_META.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Tap to add remark…"
          disabled={pending}
          className="flex-1 border-0 border-b border-input bg-transparent px-0 py-1 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="button" onClick={save} disabled={pending} aria-label="Save remark"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button" onClick={() => setOpen(false)} aria-label="Cancel"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** One entry. System rows are dimmer and carry no author — nobody typed them. */
function Entry({ entry }: { entry: ThreadEntry }) {
  const system = entry.kind === "system";
  return (
    <div className={cn("flex flex-wrap items-baseline gap-1.5 text-xs", system && "opacity-60")}>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium tabular-nums text-primary">
        {stamp(entry.createdAt)}
      </span>
      {entry.status && (
        <Badge className={cn("text-[10px]", leadStatusTone(entry.status))}>
          {statusLabel(entry.status)}
        </Badge>
      )}
      <span className="min-w-0 flex-1 text-muted-foreground">{entry.body}</span>
      {!system && entry.authorName && (
        <span className="shrink-0 text-[10px] text-muted-foreground/70">{entry.authorName}</span>
      )}
    </div>
  );
}
