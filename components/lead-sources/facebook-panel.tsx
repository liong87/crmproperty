"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Facebook, Download, Plus, Trash2, Unplug, CheckCircle2 } from "lucide-react";
import { importMetaForms, createMetaForm, disconnectMetaPage } from "@/server/lead-sources/meta-forms";
import { INTEREST } from "@/lib/constants";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/ui/alert";

interface CustomQuestion { key: string; label: string; options: string }

/**
 * The Facebook half of Leads Capture: pull in the forms that already exist, or build a
 * new one without leaving the CRM.
 *
 * The create form is a one-way door and the UI has to say so, because Meta does not
 * let a lead form be edited after it exists — only archived. Discovering that after
 * typing the wrong question is a bad way to learn it.
 */
export function FacebookPanel({
  configured, oauthReady, connectedPageName, projects,
}: {
  /** We have credentials from somewhere — a connected Page, or the env fallback. */
  configured: boolean;
  /** The app has what Facebook Login needs, so the Connect button can work. */
  oauthReady: boolean;
  /** Set only when the credentials come from a Page connected through the button. */
  connectedPageName: string | null;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [building, setBuilding] = React.useState(false);

  const [name, setName] = React.useState("");
  const [privacyUrl, setPrivacyUrl] = React.useState("");
  const [followUpUrl, setFollowUpUrl] = React.useState("");
  const [headline, setHeadline] = React.useState("");
  const [body, setBody] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [interest, setInterest] = React.useState("");
  const [askEmail, setAskEmail] = React.useState(true);
  const [custom, setCustom] = React.useState<CustomQuestion[]>([]);

  function onImport() {
    setError(null); setNote(null);
    start(async () => {
      const res = await importMetaForms();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      const { found, imported, existing } = res.data;
      setNote(
        found === 0
          ? "Facebook has no lead forms on this Page yet."
          : `${found} form${found === 1 ? "" : "s"} on Facebook — ${imported} newly imported, ${existing} already here.`,
      );
      router.refresh();
    });
  }

  function onCreate() {
    setError(null); setNote(null);
    const questions = [
      { type: "FULL_NAME" as const },
      { type: "PHONE" as const },
      ...(askEmail ? [{ type: "EMAIL" as const }] : []),
      ...custom
        .filter((c) => c.key.trim() && c.label.trim())
        .map((c) => ({
          type: "CUSTOM" as const,
          key: c.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"),
          label: c.label.trim(),
          options: c.options.split(",").map((o) => o.trim()).filter(Boolean),
        })),
    ];
    start(async () => {
      const res = await createMetaForm({
        name, questions, privacyPolicyUrl: privacyUrl,
        followUpUrl, introHeadline: headline, introBody: body,
        projectId: projectId || null,
        defaultInterest: interest || null,
      });
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      setNote(
        "Created on Facebook as a DRAFT. It stays invisible until an ad uses it — that is Meta's behaviour, not a failure.",
      );
      setBuilding(false);
      setName(""); setPrivacyUrl(""); setFollowUpUrl(""); setHeadline(""); setBody("");
      setProjectId(""); setInterest(""); setCustom([]);
      router.refresh();
    });
  }

  function onDisconnect() {
    setError(null); setNote(null);
    start(async () => {
      const res = await disconnectMetaPage();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <Facebook className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Facebook is not connected</p>
        {oauthReady ? (
          <>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Sign in with Facebook and the CRM will read your Page&rsquo;s lead forms and create
              new ones. Your access token is encrypted before it is stored.
            </p>
            {/* A plain link, not a fetch: this is a full-page redirect to facebook.com.
                Styled with buttonVariants because Button renders a real <button>. */}
            <Link
              href="/api/auth/facebook/start"
              prefetch={false}
              className={cn(buttonVariants(), "mt-4")}
            >
              <Facebook className="mr-2 h-4 w-4" /> Connect Facebook
            </Link>
          </>
        ) : (
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Facebook login is not configured yet. It needs{" "}
            <code className="font-mono text-xs">META_APP_ID</code>, the app secret, and{" "}
            <code className="font-mono text-xs">APP_URL</code>. Setting{" "}
            <code className="font-mono text-xs">META_PAGE_ID</code> and{" "}
            <code className="font-mono text-xs">META_PAGE_ACCESS_TOKEN</code> directly also works.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connectedPageName ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
          <span className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            Connected to <strong className="font-semibold">{connectedPageName}</strong>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onDisconnect} disabled={pending}>
            <Unplug className="mr-1.5 h-3.5 w-3.5" /> Disconnect
          </Button>
        </div>
      ) : (
        /* Credentials came from the environment rather than the button. Worth saying,
           because "Disconnect" is absent and somebody will wonder why. */
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Using the Page token from the environment. Connect through Facebook instead to manage
          it from here.
          {oauthReady && (
            <>
              {" "}
              <Link href="/api/auth/facebook/start" prefetch={false} className="text-primary underline underline-offset-2">
                Connect Facebook
              </Link>
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onImport} disabled={pending}>
          <Download className="mr-2 h-4 w-4" />
          {pending ? "Working…" : "Import forms from Facebook"}
        </Button>
        <Button type="button" onClick={() => setBuilding((b) => !b)} disabled={pending}>
          <Plus className="mr-2 h-4 w-4" /> New form on Facebook
        </Button>
      </div>

      {note && <p className="rounded-md bg-secondary px-3 py-2 text-sm">{note}</p>}
      {error && <FormAlert>{error}</FormAlert>}

      {building && (
        <div className="space-y-4 rounded-lg border p-4">
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            A Facebook lead form <strong className="font-semibold text-foreground">cannot be edited once created</strong> —
            Meta allows only create and archive. Read it through before submitting.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="fb-name">Form name</Label>
              <Input id="fb-name" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Skyline Residence — September launch" />
              <p className="mt-1 text-xs text-muted-foreground">Only you see this. Put the project and month in it.</p>
            </div>
            <div>
              <Label htmlFor="fb-privacy">Privacy policy URL</Label>
              <Input id="fb-privacy" value={privacyUrl} onChange={(e) => setPrivacyUrl(e.target.value)}
                placeholder="https://your-agency.com/privacy" />
              <p className="mt-1 text-xs text-muted-foreground">Meta requires this and checks the page loads.</p>
            </div>
            <div>
              <Label htmlFor="fb-followup">Website after submitting (optional)</Label>
              <Input id="fb-followup" value={followUpUrl} onChange={(e) => setFollowUpUrl(e.target.value)}
                placeholder="https://your-agency.com/skyline" />
            </div>
            <div>
              <Label htmlFor="fb-project">Feeds project</Label>
              <Select id="fb-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="fb-headline">Intro headline (optional)</Label>
              <Input id="fb-headline" value={headline} onChange={(e) => setHeadline(e.target.value)}
                placeholder="Freehold from RM 450k" />
            </div>
            <div>
              <Label htmlFor="fb-interest">Default interest</Label>
              <Select id="fb-interest" value={interest} onChange={(e) => setInterest(e.target.value)}>
                <option value="">None</option>
                {INTEREST.map((i) => <option key={i} value={i}>{i}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="fb-body">Intro text (optional)</Label>
            <Textarea id="fb-body" rows={2} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Leave your details and an agent will call you today." />
            <p className="mt-1 text-xs text-muted-foreground">Shown with the headline. Both or neither.</p>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">Questions</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Name and phone are always asked and pre-filled from the person&rsquo;s Facebook profile.
              Every extra question costs you completions — three or four in total is the usual advice.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={askEmail} onChange={(e) => setAskEmail(e.target.checked)} />
              Also ask for email
            </label>

            {custom.map((c, i) => (
              <div key={i} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                <Input placeholder="key e.g. budget" value={c.key}
                  onChange={(e) => setCustom((cs) => cs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                <Input placeholder="Question shown" value={c.label}
                  onChange={(e) => setCustom((cs) => cs.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <Input placeholder="Choices, comma separated (leave blank for free text)" value={c.options}
                  onChange={(e) => setCustom((cs) => cs.map((x, j) => j === i ? { ...x, options: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setCustom((cs) => cs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" className="mt-3"
              onClick={() => setCustom((cs) => [...cs, { key: "", label: "", options: "" }])}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add a question
            </Button>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={onCreate} disabled={pending || !name.trim() || !privacyUrl.trim()}>
              {pending ? "Creating…" : "Create on Facebook"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setBuilding(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
