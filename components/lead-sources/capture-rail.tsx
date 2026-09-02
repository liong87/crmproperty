"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Facebook,
  MessageCircle,
  Plus,
  RefreshCw,
  Unplug,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPageSubscriptions, disconnectAccount } from "@/server/capture/actions";
import type { CaptureAccountView } from "@/server/capture/queries";
import { cn } from "@/lib/utils";

/**
 * The accounts rail: who is connected, and what each connection is feeding.
 *
 * This is the piece the competitor gets right and we did not. Connecting used to be a
 * paragraph explaining which environment variables an administrator had to set — which
 * is a deploy, not a feature, and no agent can do it. Here it is a person's name, their
 * pages, and an Add button.
 *
 * Everything on this rail is PER USER. An agent sees their own connections and nobody
 * else's, admins included; see server/capture/ownership.ts. Nothing here — and nothing
 * in the props feeding it — contains a token.
 */
export function CaptureRail({
  accounts,
  oauthReady,
  formCounts,
  highlightAccountId,
}: {
  accounts: CaptureAccountView[];
  oauthReady: boolean;
  /** capture page id → number of lead forms mapped to it. */
  formCounts: Record<string, number>;
  /** Just came back from Facebook — open this one's picker straight away. */
  highlightAccountId?: string;
}) {
  const pagesConnected = accounts.reduce((n, a) => n + a.pages.filter((p) => p.subscribed).length, 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Facebook className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Facebook accounts</h2>
              <p className="text-xs text-muted-foreground">
                {pagesConnected === 0
                  ? "No page connected"
                  : `${pagesConnected} page${pagesConnected === 1 ? "" : "s"} connected`}
              </p>
            </div>
          </div>
          {oauthReady && (
            <a
              href="/api/auth/facebook/start"
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Add
            </a>
          )}
        </header>

        <div className="mt-3 space-y-3">
          {!oauthReady && (
            <p className="rounded-xl border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Facebook login is not switched on yet. Once the Meta app is live, Add signs you
              in with your own Facebook account.
            </p>
          )}

          {oauthReady && accounts.length === 0 && (
            <p className="rounded-xl border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
              No account yet. Click <strong className="font-semibold">Add</strong> to connect
              yours — your login and your pages stay yours, and nobody else in the agency can
              see or use them.
            </p>
          )}

          {accounts.map((account) => (
            <AccountBlock
              key={account.id}
              account={account}
              formCounts={formCounts}
              defaultOpen={account.id === highlightAccountId}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-4">
        <header className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#25D366]/10">
            <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">WhatsApp accounts</h2>
            <p className="text-xs text-muted-foreground">0 connected</p>
          </div>
        </header>
        <p className="mt-3 rounded-xl border border-dashed px-3 py-4 text-xs text-muted-foreground">
          Capturing from WhatsApp needs the Cloud API — a verified Meta Business and a
          dedicated number that leaves the normal WhatsApp app permanently. Today the CRM
          opens a pre-filled wa.me link instead, so the agent messages from their own
          number and the client sees the person they already know.
        </p>
      </section>
    </div>
  );
}

function AccountBlock({
  account,
  formCounts,
  defaultOpen,
}: {
  account: CaptureAccountView;
  formCounts: Record<string, number>;
  defaultOpen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [open, setOpen] = React.useState(defaultOpen);
  const [error, setError] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(
    () => new Set(account.pages.filter((p) => p.subscribed).map((p) => p.id)),
  );

  const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() < Date.now();
  const live = account.pages.filter((p) => p.subscribed);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await setPageSubscriptions(account.id, [...picked]);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      // Partial success is reported as it happened. Rolling back a page that DID
      // subscribe, to make the message tidy, would lose leads.
      if (res.data.failed.length > 0) setError(`Could not switch on: ${res.data.failed.join("; ")}`);
      else setOpen(false);
      router.refresh();
    });
  }

  function disconnect() {
    setError(null);
    start(async () => {
      const res = await disconnectAccount(account.id);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
            {account.displayName.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{account.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {live.length} page{live.length === 1 ? "" : "s"} connected
            </p>
          </div>
        </div>
        {/* Reconnecting is also how a token is refreshed, so this is a re-sync as much
            as a repair — same route either way. */}
        <a
          href="/api/auth/facebook/start"
          title="Re-sync this connection"
          className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      {expired && (
        <p className="mt-2 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          This connection has expired, so leads have stopped arriving. Re-sync to restore it.
        </p>
      )}

      {live.length > 0 && (
        <ul className="mt-2.5 space-y-1.5">
          {live.map((page) => {
            const forms = formCounts[page.id] ?? 0;
            return (
              <li key={page.id} className="pl-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      forms > 0 ? "bg-emerald-500" : "bg-amber-500",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{page.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {forms} form{forms === 1 ? "" : "s"}
                  </span>
                </div>
                {forms === 0 && (
                  <p className="pl-3.5 text-[11px] text-amber-600">
                    No form imported yet — import one to start receiving leads.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} aria-hidden />
          Choose pages
        </button>
        <button
          type="button"
          onClick={disconnect}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <Unplug className="h-3.5 w-3.5" aria-hidden />
          Disconnect
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {/* Nothing is pre-ticked for a new connection on purpose: somebody's personal
              page is usually in this list, and it should take a deliberate tick before
              it starts feeding a work CRM. */}
          <p className="pb-1 text-[11px] text-muted-foreground">
            Tick the pages you run property ads on.
          </p>
          {account.pages.map((page) => (
            <label
              key={page.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/60"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={picked.has(page.id)}
                onChange={() => toggle(page.id)}
                disabled={pending}
              />
              <span className="min-w-0 flex-1 truncate text-xs">{page.name}</span>
            </label>
          ))}
          <Button size="sm" className="mt-1 h-8 w-full text-xs" onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Save pages
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
