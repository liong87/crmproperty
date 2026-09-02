import { MessageCircle, Search, Lock } from "lucide-react";

/**
 * WhatsApp capture, honestly not built.
 *
 * The column exists at full width rather than being hidden because the shape of the
 * page is the promise: leads arrive from Facebook AND WhatsApp, and hiding the half we
 * have not done makes the first one look like the whole product. What it must not do is
 * pretend — the controls are visibly locked and the reason is written out, because a
 * dead toggle that silently does nothing is worse than no toggle.
 */
export function WhatsAppColumn() {
  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border bg-card p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            WhatsApp
            <span className="tabular-nums text-muted-foreground">0</span>
          </h2>
          <p className="text-xs text-muted-foreground">Leads from trigger words</p>
        </div>
        <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Not connected
        </span>
      </header>

      <div className="relative mt-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          disabled
          placeholder="Search trigger words…"
          className="h-10 w-full cursor-not-allowed rounded-xl border bg-muted/40 pl-9 pr-4 text-sm text-muted-foreground"
        />
      </div>

      <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
        <MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="text-xs font-medium">No WhatsApp captures yet</p>
        <p className="max-w-[34ch] text-[11px] leading-relaxed text-muted-foreground">
          Reading leads out of WhatsApp needs the Cloud API: a verified Meta Business, a
          dedicated number that leaves the normal WhatsApp app permanently, and approved
          message templates. The 24-hour window means no cold messaging at any price.
        </p>
        <p className="max-w-[34ch] text-[11px] leading-relaxed text-muted-foreground">
          Until then the CRM opens a pre-filled wa.me link from any lead, so the agent sends
          from their own number — no approval, no per-message cost, and the client sees the
          person they already know.
        </p>
      </div>
    </section>
  );
}
