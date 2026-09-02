"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, CalendarPlus, Check, Loader2, Clock } from "lucide-react";
import { logActivity } from "@/server/activities/actions";
import { statusLabel } from "@/lib/constants";
import { RemarkThread } from "./remark-thread";
import type { WorkingLead } from "@/server/leads/working";
import { Badge } from "@/components/ui/badge";
import { leadStatusTone } from "@/lib/status";
import { formatMYR, cn } from "@/lib/utils";
import { STATUS } from "@/lib/chart-colors";

const relTime = (d: Date | null): string => {
  if (!d) return "never contacted";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

/**
 * One lead in the queue, with the two actions that matter on it.
 *
 * "Called" and "WhatsApp" write real activity rows through logActivity — the same path
 * the lead detail page uses — so the timeline, the follow-up rate and this card's own
 * dormancy badge all move together. A button that only updated a counter would make
 * the metric a lie within a week.
 */
export function WorkingLeadCard({ lead, waTemplate }: { lead: WorkingLead; waTemplate: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  // Tone the dormancy badge only once it means something. A lead touched today does
  // not need a colour telling anyone it is fine.
  const tone =
    lead.dormantDays >= 14 ? STATUS.critical
    : lead.dormantDays >= 7 ? STATUS.warning
    : undefined;

  function touch(type: "call" | "whatsapp", body: string) {
    setError(null);
    start(async () => {
      const res = await logActivity({ entityType: "leads", entityId: lead.id, type, body });
      if (!res.success) return setError(res.error ?? "Could not log that.");
      setDone(type);
      router.refresh();
    });
  }



  const waHref = `https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
    waTemplate.replace("{name}", lead.name.split(" ")[0] ?? lead.name),
  )}`;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/leads/${lead.id}`} className="block truncate font-medium hover:underline">
            {lead.name}
          </Link>
          <a
            href={`tel:${lead.phone}`}
            className="mt-0.5 block text-sm tabular-nums text-muted-foreground hover:text-foreground"
          >
            {lead.phone}
          </a>
        </div>
        <Badge className={leadStatusTone(lead.status)}>{statusLabel(lead.status)}</Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {lead.projectName && <Badge variant="secondary">{lead.projectName}</Badge>}
        {lead.interest && <Badge variant="outline" className="capitalize">{lead.interest}</Badge>}
        {lead.budgetMin != null && (
          <Badge variant="outline">
            {formatMYR(lead.budgetMin)}{lead.budgetMax ? ` – ${formatMYR(lead.budgetMax)}` : "+"}
          </Badge>
        )}
        {lead.openAppointments > 0 && (
          <Badge variant="outline">
            {lead.openAppointments} appointment{lead.openAppointments === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {relTime(lead.lastTouchAt)}
        </span>
        {lead.touchCount > 0 && <span>{lead.touchCount}× touched</span>}
        <span className="font-medium" style={tone ? { color: tone } : undefined}>
          {lead.dormantDays}d quiet
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => touch("call", "Called from the working queue.")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-50"
        >
          {pending && done === "call" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
          Called
        </button>

        {/* Opens WhatsApp with the message pre-typed but NOT sent, then logs it. The
            agent still presses send — we do not claim to have sent something we did
            not, and the timeline says "opened WhatsApp" for exactly that reason. */}
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => touch("whatsapp", "Opened WhatsApp from the working queue.")}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-secondary"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </a>

        <Link
          href={`/leads/${lead.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-secondary"
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Book
        </Link>

      </div>

      {/* The remark thread. Status moves only from in here, so every change carries
          its reason and the follow-up history stays complete. */}
      <div className="mt-3 border-t pt-2">
        <RemarkThread
          leadId={lead.id}
          latest={lead.latestRemark}
          latestAt={lead.latestRemarkAt}
          currentStatus={lead.status}
          onSaved={() => router.refresh()}
        />
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {done && !error && !pending && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Check className="h-3 w-3" /> Logged
        </p>
      )}
    </div>
  );
}
