import { redirect } from "next/navigation";
import { Facebook, Globe, MessageCircle } from "lucide-react";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listLeadFormSources } from "@/server/lead-sources/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { LeadSourceManager } from "@/components/lead-sources/source-manager";
import { FacebookPanel } from "@/components/lead-sources/facebook-panel";
import { metaLeadForms } from "@/lib/leadads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Leads Capture — every way a lead can reach the CRM, on one page.
 *
 * Previously this was "Lead sources" and did one thing: map a form id typed out of the
 * Meta console to a project. The mapping table is still the heart of it, but the id no
 * longer has to be typed — forms are read from the Page, and new ones can be created
 * here and pushed to Facebook.
 */
export default async function LeadsCapturePage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isManagerOrAbove(me)) redirect("/dashboard");

  const [sources, projects] = await Promise.all([listLeadFormSources(), listProjectOptions()]);
  // Checked on the server so the panel never renders a button that cannot work.
  const fbConfigured = metaLeadForms.isConfigured();
  const metaCount = sources.filter((s) => s.provider === "meta").length;
  const unmapped = sources.filter((s) => !s.projectId).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">Leads capture</h1>
        <p className="text-sm text-muted-foreground">
          Where leads come from, and which project each source feeds.
        </p>
      </div>

      {unmapped > 0 && (
        <p className="rounded-lg border bg-secondary/40 px-4 py-3 text-sm">
          <strong className="font-semibold">{unmapped}</strong>{" "}
          {unmapped === 1 ? "form has" : "forms have"} no project yet. Leads from{" "}
          {unmapped === 1 ? "it" : "them"} still arrive — they just will not count towards a
          launch until a project is set.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-4 w-4 text-muted-foreground" /> Facebook &amp; Instagram
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fbConfigured
              ? `${metaCount} form${metaCount === 1 ? "" : "s"} mapped. Import what already exists on the Page, or build a new form here.`
              : "Connect a Page to read and create lead forms without leaving the CRM."}
          </p>
        </CardHeader>
        <CardContent>
          <FacebookPanel configured={fbConfigured} projects={projects} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapped forms</CardTitle>
          <p className="text-sm text-muted-foreground">
            Which form feeds which project. New campaigns are mapped here, not in code.
          </p>
        </CardHeader>
        <CardContent>
          <LeadSourceManager sources={sources} projects={projects} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" /> Website &amp; other platforms
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Landing pages, Tally, Typeform and Google Ads post straight into the CRM. Each
            provider has its own signed endpoint:
          </p>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
            https://your-domain/api/webhooks/forms/&#123;tally|typeform|googleads|generic&#125;
          </p>
          <p>
            Your own landing pages can post to{" "}
            <code className="font-mono text-xs">/api/public/leads</code> with a per-page API key
            instead — no webhook secret needed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-muted-foreground" /> WhatsApp capture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Not connected. Capturing leads from WhatsApp needs the Cloud API: a verified Meta
            Business, a dedicated number that leaves the normal WhatsApp app permanently, and
            approved message templates.
          </p>
          <p>
            Today the CRM opens a pre-filled wa.me link so the agent sends from their own
            number — no approval, no per-message cost, and the client sees the person they
            already know.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
