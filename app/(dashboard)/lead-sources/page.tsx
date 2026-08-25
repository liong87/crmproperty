import { redirect } from "next/navigation";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { listLeadFormSources } from "@/server/lead-sources/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { LeadSourceManager } from "@/components/lead-sources/source-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LeadSourcesPage() {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");
  if (!isManagerOrAbove(me)) redirect("/dashboard");

  const [sources, projects] = await Promise.all([listLeadFormSources(), listProjectOptions()]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Lead sources</h1>
        <p className="text-sm text-muted-foreground">
          Which ad form feeds which project. New campaigns are mapped here, not in code.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Mapped forms</CardTitle></CardHeader>
        <CardContent>
          <LeadSourceManager sources={sources} projects={projects} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Connecting Meta Lead Ads</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            In the Meta App dashboard, add the <strong>Webhooks</strong> product, subscribe the
            Page to the <code className="font-mono text-xs">leadgen</code> field, and give it this
            callback URL:
          </p>
          <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground">
            https://your-domain/api/webhooks/forms/meta
          </p>
          <p>
            Paste the same verify token you set in <code className="font-mono text-xs">META_VERIFY_TOKEN</code>.
            The App Secret goes in <code className="font-mono text-xs">WEBHOOK_SECRET_META</code>, and a
            long-lived Page token with <code className="font-mono text-xs">leads_retrieval</code> goes in{" "}
            <code className="font-mono text-xs">META_PAGE_ACCESS_TOKEN</code> — Meta&rsquo;s webhook
            carries no lead data, so that token is what fetches it.
          </p>
          <p>
            Then copy each form&rsquo;s id from Meta and map it above. A lead from an unmapped form
            is still captured; it simply arrives without a project.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
