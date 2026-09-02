import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listStaleLeads, STALE_AFTER_DAYS } from "@/server/leads/stale";
import { listAssignableAgents } from "@/server/leads/queries";
import { StaleLeadList } from "@/components/leads/stale-list";

/**
 * Leads going cold.
 *
 * Scoped by role like everything else: an agent sees their own, a team lead sees the
 * team's. Nothing here reassigns automatically — see server/leads/stale.ts.
 */
/**
 * `?days=` narrows or widens the window.
 *
 * Fourteen days is the default because a fortnight of silence on a live enquiry is
 * hard to defend. It is not a universal truth though — a rental enquiry goes cold in
 * days, a bungalow buyer takes months — so the window is adjustable without a deploy.
 * Clamped to 1–365: zero would list every open lead and read as an alarm.
 */
function parseDays(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(n)) return STALE_AFTER_DAYS;
  return Math.min(365, Math.max(1, Math.round(n)));
}

export default async function StaleLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const days = parseDays((await searchParams).days);
  const canReassign = isTeamLeadOrAbove(me);
  const [leads, agents] = await Promise.all([
    listStaleLeads(me, days),
    canReassign ? listAssignableAgents() : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/leads" className="text-sm text-muted-foreground hover:underline">
          ← Leads
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Going cold</h1>
        <p className="text-sm text-muted-foreground">
          Open leads with nothing logged for {days} day{days === 1 ? "" : "s"} or more,
          coldest first.
          {canReassign
            ? " Reassigning records who moved it and why, on the lead itself."
            : " Chase them, or ask your team lead to move them on."}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Quiet for at least</span>
          {[3, 7, 14, 30, 60].map((d) => (
            <Link
              key={d}
              href={`/leads/stale?days=${d}`}
              className={
                d === days
                  ? "rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground"
                  : "rounded-full px-2.5 py-1 text-muted-foreground hover:bg-muted"
              }
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      <StaleLeadList leads={leads} agents={agents} canReassign={canReassign} />
    </div>
  );
}
