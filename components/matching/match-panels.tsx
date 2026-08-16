import Link from "next/link";
import { Building2, UserSearch } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMYR } from "@/lib/utils";
import { findListingsForBuyer, findBuyersForListing } from "@/server/matching/queries";
import type { BuyerCriteria } from "@/server/matching/score";
import type { User } from "@/lib/db/schema";

/**
 * Server components: both panels fetch their own data, so a page adds matching with
 * one line and no extra props threading.
 *
 * Kept quiet by design — a panel that shouts would compete with the record itself.
 * Empty states say why there is nothing rather than just "no results", because with
 * matching the reason is usually actionable: no budget recorded, or no listings in
 * that range yet.
 */

function Reasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reasons.map((r) => (
        <span key={r} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {r}
        </span>
      ))}
    </div>
  );
}

/** "Matching listings" — shown on a lead or a contact. */
export async function MatchingListings({
  criteria,
  who,
}: {
  criteria: BuyerCriteria;
  who: string;
}) {
  const matches = await findListingsForBuyer(criteria);

  // A vendor is not shopping — no panel at all rather than an empty one.
  const interest = (criteria.interest ?? "").toLowerCase();
  if (interest === "sell" || interest === "") return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Matching listings
        </CardTitle>
        {matches.length > 0 && (
          <Link href="/properties" className="text-sm text-primary underline-offset-2 hover:underline">
            All listings
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {criteria.budgetMin == null && criteria.budgetMax == null
              ? `No active listings match yet. Adding a budget for ${who} will sharpen this.`
              : "No active listings in this budget and area yet."}
          </p>
        ) : (
          <ul className="divide-y">
            {matches.map((m) => (
              <li key={m.id} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/properties/${m.id}`} className="font-medium hover:underline">
                      {m.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {m.area}, {m.state} · {m.propertyType}
                      {m.bedrooms ? ` · ${m.bedrooms} bed` : ""}
                    </div>
                    <Reasons reasons={m.match.reasons} />
                  </div>
                  <div className="shrink-0 text-sm font-medium">{formatMYR(m.askingPrice)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** "Interested buyers" — shown on a property. Scoped to the viewer's own clients. */
export async function InterestedBuyers({
  user,
  listing,
}: {
  user: User;
  listing: { listingType: string; askingPrice: number; state: string; area: string };
}) {
  const matches = await findBuyersForListing(user, listing);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserSearch className="h-4 w-4" /> Interested buyers
        </CardTitle>
      </CardHeader>
      <CardContent>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None of your leads or contacts match this listing yet.
          </p>
        ) : (
          <ul className="divide-y">
            {matches.map((m) => (
              <li key={`${m.kind}-${m.id}`} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={m.kind === "lead" ? `/leads/${m.id}` : `/contacts/${m.id}`}
                      className="font-medium hover:underline"
                    >
                      {m.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {m.phone}
                      {m.budgetMin || m.budgetMax
                        ? ` · ${formatMYR(m.budgetMin)}${m.budgetMax ? ` – ${formatMYR(m.budgetMax)}` : ""}`
                        : ""}
                    </div>
                    <Reasons reasons={m.match.reasons} />
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {m.kind}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
