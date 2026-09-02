import { redirect } from "next/navigation";
import { CircleAlert, CircleCheck } from "lucide-react";
import { PageTitle } from "@/components/ui/page-title";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { listLeadFormSources } from "@/server/lead-sources/queries";
import { listProjectOptions } from "@/server/projects/queries";
import { listMyCaptureAccounts } from "@/server/capture/queries";
import { captureOAuthConfigured } from "@/lib/capture/meta-graph";
import { CaptureRail } from "@/components/lead-sources/capture-rail";
import { FacebookFormColumn, type FormRow } from "@/components/lead-sources/facebook-form-column";
import { STATUS } from "@/lib/chart-colors";

/**
 * Leads capture — every way a lead can reach the CRM, on one page.
 *
 * The shape is: SOURCES on the left, ACCOUNTS on the right. That ordering is the whole
 * point of the rewrite. Connecting used to be a paragraph naming the environment
 * variables an administrator had to set, which is a deploy rather than a feature and
 * which no agent can do for themselves. Now every agent signs in with their own
 * Facebook account from the rail, ticks their own pages, and their forms appear in the
 * column beside it.
 *
 * The rail is per-user and shows only the signed-in person's connections — admins
 * included. See server/capture/ownership.ts.
 */
export default async function LeadsCapturePage({
  searchParams,
}: {
  searchParams: Promise<{
    fb_connected?: string;
    fb_error?: string;
    fb_note?: string;
    fb_pick?: string;
  }>;
}) {
  const me = await getCurrentDbUser();
  if (!me) redirect("/sign-in");

  // Mapping a form to a project decides whose funnel and whose budget a paid lead
  // counts against, so it stays with team leads. Connecting your own account does not.
  const manages = isTeamLeadOrAbove(me);

  const [sources, projects, myAccounts, sp] = await Promise.all([
    manages ? listLeadFormSources() : Promise.resolve([]),
    manages ? listProjectOptions() : Promise.resolve([]),
    listMyCaptureAccounts("facebook"),
    searchParams,
  ]);

  const oauthReady = captureOAuthConfigured();

  // page id → name, for showing a form's connection on its own row.
  const pageNames = new Map<string, string>();
  for (const account of myAccounts) {
    for (const page of account.pages) pageNames.set(page.id, page.name);
  }

  const metaForms: FormRow[] = sources
    .filter((s) => s.provider === "meta")
    .map((s) => ({ ...s, pageName: s.capturePageId ? pageNames.get(s.capturePageId) ?? null : null }));

  const formCounts: Record<string, number> = {};
  for (const s of sources) {
    if (!s.capturePageId) continue;
    formCounts[s.capturePageId] = (formCounts[s.capturePageId] ?? 0) + 1;
  }

  const connectedPages = myAccounts.reduce((n, a) => n + a.pages.filter((p) => p.subscribed).length, 0);

  return (
    <div className="space-y-5">
      <PageTitle title="Leads capture" count={connectedPages}>
        {connectedPages === 1 ? "page" : "pages"} connected. Sign in with your own Facebook
        account and pick which pages send leads to your CRM.
      </PageTitle>

      {/* The OAuth round trip comes back through the query string, because a redirect
          from facebook.com cannot carry anything else. */}
      {sp.fb_error && (
        <p
          className="flex items-start gap-2 rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: STATUS.critical }}
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: STATUS.critical }} />
          <span>{sp.fb_error}</span>
        </p>
      )}
      {sp.fb_connected && (
        <p className="flex items-start gap-2 rounded-xl border bg-secondary/40 px-4 py-3 text-sm">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            Signed in as <strong className="font-semibold">{sp.fb_connected}</strong>. Tick the
            pages you want sending leads, on the right.
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <FacebookFormColumn
          forms={metaForms}
          projects={projects}
          canManage={manages}
          hasConnection={connectedPages > 0}
        />
        <div>
          <CaptureRail
            accounts={myAccounts}
            oauthReady={oauthReady}
            formCounts={formCounts}
            {...(sp.fb_pick ? { highlightAccountId: sp.fb_pick } : {})}
          />
        </div>
      </div>

    </div>
  );
}
