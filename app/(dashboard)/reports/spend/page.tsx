import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { getCampaignCosts, listKnownCampaigns } from "@/server/reports/spend";
import { listSpend } from "@/server/campaign-spend/actions";
import { SpendManager } from "@/components/reports/spend-manager";

/**
 * Advertising spend and cost per lead — team leads and admins only.
 *
 * The server queries assert the same rule, so this redirect is convenience rather
 * than security. Agents are sent back to the reports they may see.
 */
export default async function SpendPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isTeamLeadOrAbove(me)) redirect("/reports");

  const [report, entries, knownCampaigns] = await Promise.all([
    getCampaignCosts(me, 3),
    listSpend(),
    listKnownCampaigns(me, 6),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/reports" className="text-sm text-muted-foreground hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Advertising spend</h1>
        <p className="text-sm text-muted-foreground">
          What each campaign cost, against what it produced. Last three months.
          Cost per <strong>booking</strong> is the one to judge a live campaign on — a
          completed sale is months behind it, so cost per closed deal is a verdict on
          last year&rsquo;s advertising.
        </p>
      </div>

      <SpendManager report={report} entries={entries} knownCampaigns={knownCampaigns} />
    </div>
  );
}
