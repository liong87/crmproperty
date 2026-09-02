import Link from "next/link";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { getCurrentDbUser } from "@/lib/auth";
import {
  listWorkingLeads, countWorkingTabs, getFollowUpRate, type WorkingTab,
} from "@/server/leads/working";
import { WorkingLeadCard } from "@/components/leads/working-lead-card";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export const metadata = { title: "Working Leads" };

/**
 * The daily queue: what I personally have to work, quietest first.
 *
 * Deliberately separate from /leads. That page is the database — every lead, sortable,
 * searchable, for looking somebody up. This one answers "what do I do next", and the
 * two questions want opposite designs: a table for the first, cards with actions for
 * the second.
 */
export default async function WorkingLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const raw = (await searchParams).tab;
  const tab: WorkingTab =
    raw === "inactive" || raw === "appointment" ? raw : "active";

  const [items, counts, rate] = await Promise.all([
    listWorkingLeads(me, tab),
    countWorkingTabs(me),
    getFollowUpRate(me, 7),
  ]);

  // The WhatsApp opener. A saved per-workspace template is Configuration work (spec
  // §12.6); until that exists this is a sensible default rather than a blank message.
  const waTemplate = `Hi {name}, this is ${me.name.split(" ")[0] ?? me.name} from Lanthorn Realty. `;

  const pctLabel = rate.pct == null ? "—" : `${Math.round(rate.pct * 100)}%`;
  const pctTone =
    rate.pct == null ? undefined
      : rate.pct >= 0.7 ? STATUS.good
      : rate.pct >= 0.4 ? STATUS.warning
      : STATUS.critical;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Working leads</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{counts.active}</span>{" "}
            {counts.active === 1 ? "lead" : "leads"} to work on, quietest first.
          </p>
        </div>

        {/* The follow-up pill. The spec makes this the primary KPI and puts it on every
            screen — it nags you to touch leads rather than admire them. */}
        <div className="rounded-xl border bg-card px-3.5 py-2 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/70">
            Followed up · last {rate.days} days
          </p>
          <p className="mt-0.5 text-sm">
            <span className="text-lg font-semibold tabular-nums" style={pctTone ? { color: pctTone } : undefined}>
              {pctLabel}
            </span>{" "}
            <span className="text-muted-foreground tabular-nums">
              {rate.followed}/{rate.total} touched
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Tab href="/working-leads" label="Active" count={counts.active} active={tab === "active"} />
        <Tab href="/working-leads?tab=appointment" label="Appointment" count={counts.appointment} active={tab === "appointment"} />
        <Tab href="/working-leads?tab=inactive" label="Inactive" count={counts.inactive} active={tab === "inactive"} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={
            tab === "active" ? "Nothing to work right now"
              : tab === "appointment" ? "No appointments booked"
              : "Nothing marked disqualified"
          }
          hint={
            tab === "active"
              ? "Leads land here when someone assigns them to you, or when one comes in from a campaign you own."
              : tab === "appointment"
                ? "Book one from a lead and it will appear here and on the Appointments board."
                : "Leads you disqualify move here, so the active queue stays honest."
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((l) => (
            <WorkingLeadCard key={l.id} lead={l} waTemplate={waTemplate} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Looking for a lead that is not yours, or one you disqualified months ago?{" "}
        <Link href="/leads" className="text-primary underline underline-offset-2">
          Leads
        </Link>{" "}
        is the full database.
      </p>
    </div>
  );
}

function Tab({
  href, label, count, active,
}: {
  href: string; label: string; count: number; active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{count}</span>
    </Link>
  );
}
