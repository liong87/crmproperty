"use client";

/**
 * What an agent sees when a dashboard page throws.
 *
 * There was no error.tsx anywhere, so any failure inside a page's queries dropped them
 * onto Next's default screen: "Application error: a client-side exception has occurred",
 * plus a hex digest. To a property negotiator standing outside a sales gallery that is
 * indistinguishable from the CRM being gone, and there is nothing on it to act on.
 *
 * This says what happened in their words, offers the two things that actually help
 * (try again, go back to the dashboard), and keeps the digest — but as small print,
 * because its only reader is whoever goes looking in `wrangler tail`.
 */
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged this; the browser console gives whoever is helping
    // the agent something to read over their shoulder.
    console.error("[dashboard]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
        <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />
      </span>

      <div className="space-y-1.5">
        <h2 className="font-display text-lg font-semibold">This screen did not load</h2>
        <p className="text-sm text-muted-foreground">
          Something went wrong on our side, not yours. Nothing you entered has been lost.
          Try again — if it keeps happening, tell your administrator.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {/* h-11: a 44px target, because this is tapped on a phone in a hurry. */}
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-xl border px-4 text-sm font-semibold transition hover:bg-muted/60"
        >
          Back to dashboard
        </Link>
      </div>

      {error.digest && (
        <p className="text-[11px] text-muted-foreground">
          Reference <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
