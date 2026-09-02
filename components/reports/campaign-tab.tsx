import { Megaphone, Lock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

/**
 * Meta Ads Report — scaffolded, not faked.
 *
 * Brief 7 §15 wants spend joined to our leads so the page can answer "cost per
 * converted deal". That needs `ads_read` on an ad account, which needs the same App
 * Review and Business Verification as Brief 5, so the data does not exist yet.
 *
 * What it must NOT do in the meantime is render a chart of zeroes or of made-up
 * numbers. A cost report that looks populated and is not is worse than an empty one,
 * because somebody will make a budget decision from it. This says plainly what is
 * missing and what it will do.
 */
export function CampaignTab({ enabled }: { enabled: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" aria-hidden />
            Meta ads report
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Ad spend measured against the leads it produced — cost per lead, per appointment,
            and per converted deal.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-dashed px-4 py-8 text-center">
            <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-medium">No ad account connected</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Reading spend needs <code className="font-mono text-xs">ads_read</code> on a Meta
              ad account, which requires the same App Review and Business Verification as lead
              capture. Until that is granted there is no cost data to show — and a chart of
              zeroes here would be worse than nothing, because it reads like a real answer.
            </p>
            <span
              title={enabled ? undefined : "Waiting on Meta ad-account access"}
              className="mt-4 inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-xl border px-3 text-sm font-medium text-muted-foreground"
            >
              Connect a Meta ad account
            </span>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4 text-sm">
            <p className="font-medium">What this will show, once connected</p>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              <li>
                <strong className="font-medium text-foreground">Three levels</strong> — campaign,
                ad set and ad, each expandable, with spend, impressions, clicks, CTR and CPC.
              </li>
              <li>
                <strong className="font-medium text-foreground">Joined to your leads</strong> — the
                same rows carry our leads, appointments, show-ups, bookings and conversions, so
                cost per converted deal is one column rather than a spreadsheet exercise.
              </li>
              <li>
                <strong className="font-medium text-foreground">A visible match rate</strong> —
                &ldquo;142 of 180 leads matched (79%)&rdquo;, with the unmatched ones inspectable.
                If a fifth of leads cannot be tied to an ad, every cost figure on the page is
                wrong by an unknown amount, and a report that hides that is not one you can act on.
              </li>
              <li>
                <strong className="font-medium text-foreground">Fetched on demand</strong> — Meta&apos;s
                insights API is slow and rate-limited, so results are cached and stamped with when
                they were pulled, never refreshed on every page load.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
