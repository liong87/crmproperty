import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listStaleLeads, STALE_AFTER_DAYS } from "@/server/leads/stale";
import { listAssignableAgents } from "@/server/leads/queries";
import { StaleLeadList } from "@/components/leads/stale-list";

/**
 * Leads going cold.
 *
 * Scoped by role like everything else: an agent sees their own, a manager sees the
 * team's. Nothing here reassigns automatically — see server/leads/stale.ts.
 */
export default async function StaleLeadsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  const canReassign = isManagerOrAbove(me);
  const [leads, agents] = await Promise.all([
    listStaleLeads(me),
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
          Open leads with nothing logged for {STALE_AFTER_DAYS} days or more, coldest first.
          {canReassign
            ? " Reassigning records who moved it and why, on the lead itself."
            : " Chase them, or ask your manager to move them on."}
        </p>
      </div>

      <StaleLeadList leads={leads} agents={agents} canReassign={canReassign} />
    </div>
  );
}
