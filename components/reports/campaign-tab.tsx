import { Megaphone, Plus, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AdAccountPicker } from "./ad-account-picker";
import type { AdAccountView } from "@/server/capture/queries";

/**
 * Meta Ads Report.
 *
 * Connecting is real and self-serve, exactly like Leads capture: the agent clicks Add,
 * signs in as themselves, and their own ad accounts appear. It costs no extra consent
 * screen because `ads_management` is already in the login configuration — one Facebook
 * login gives both the Pages and the ad accounts.
 *
 * What is NOT here yet is spend. That needs the Marketing API insights call, and until
 * it exists this page shows what is connected and says plainly what is missing. A table
 * of zeroes would be worse than an empty one: somebody would set a budget from it.
 */
export function CampaignTab({ accounts }: { accounts: AdAccountView[] }) {
  const selected = accounts.filter((a) => a.selected);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
              Meta ads report
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Ad spend measured against the leads it produced — cost per lead, per appointment,
              and per converted deal.
            </p>
          </div>
          <a
            href="/api/auth/facebook/start?next=%2Freports%3Ftab%3Dcampaign"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {accounts.length > 0 ? "Re-sync" : "Connect a Meta ad account"}
          </a>
        </CardHeader>

        <CardContent className="space-y-4">
          {accounts.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No ad account connected yet. Connect signs you into <strong>your own</strong>{" "}
              Facebook — the same login as Leads capture — and brings in the ad accounts you have
              access to. Your spend stays yours; nobody else in the agency sees it.
            </p>
          ) : (
            <div className="rounded-xl border p-4">
              <p className="text-sm font-medium">Your ad accounts</p>
              <p className="mb-2 text-xs text-muted-foreground">
                Tick the ones this report should cover. Untick anything that is not your budget —
                otherwise somebody else&apos;s spend lands in your cost per lead.
              </p>
              <AdAccountPicker accounts={accounts} />
            </div>
          )}

          <div className="flex items-start gap-2.5 rounded-xl border bg-muted/30 p-4 text-sm">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">
                Spend figures are not wired up yet
                {selected.length > 0 && ` — ${selected.length} account${selected.length === 1 ? "" : "s"} ready`}
              </p>
              <ul className="mt-2 space-y-1.5 text-muted-foreground">
                <li>
                  <strong className="font-medium text-foreground">Three levels</strong> — campaign,
                  ad set and ad, each expandable, with spend, impressions, clicks, CTR and CPC.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Joined to your leads</strong> — the
                  same rows carry leads, appointments, show-ups, bookings and conversions, so cost
                  per converted deal is a column rather than a spreadsheet exercise.
                </li>
                <li>
                  <strong className="font-medium text-foreground">A visible match rate</strong> —
                  &ldquo;142 of 180 leads matched (79%)&rdquo;, with the unmatched ones inspectable.
                  If a fifth of leads cannot be tied to an ad, every cost figure is wrong by an
                  unknown amount, and hiding that makes the report unusable rather than tidy.
                </li>
                <li>
                  <strong className="font-medium text-foreground">Fetched on demand</strong> —
                  Meta&apos;s insights API is slow and rate-limited, so results are cached and
                  stamped with when they were pulled, never refreshed on every page load.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
