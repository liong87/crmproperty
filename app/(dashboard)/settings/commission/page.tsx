import { redirect } from "next/navigation";
import { COMMISSION_ENABLED } from "@/lib/features";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listSchemes } from "@/server/commission/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SchemeEditor } from "@/components/commission/scheme-editor";

export const metadata = { title: "Commission" };

export default async function CommissionSettingsPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  /*
   * Hidden until the agency's formula is settled. Reachable again by setting
   * FEATURE_COMMISSION=1 — the engine and every recorded row are untouched.
   */
  if (!COMMISSION_ENABLED) redirect("/dashboard");

  // Team leads and admins only: this decides what everybody is paid.
  if (!isTeamLeadOrAbove(me)) redirect("/dashboard");

  const schemes = await listSchemes();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Commission</h1>
        <p className="text-sm text-muted-foreground">
          How the developer&rsquo;s commission is released across a transaction, and how it
          is split. Changing a scheme affects new deals only — a deal keeps the rates it
          was built with.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Schemes</CardTitle></CardHeader>
        <CardContent><SchemeEditor schemes={schemes} /></CardContent>
      </Card>
    </div>
  );
}
