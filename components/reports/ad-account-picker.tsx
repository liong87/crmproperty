"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setAdAccountSelected } from "@/server/capture/actions";
import type { AdAccountView } from "@/server/capture/queries";

/**
 * Which of your ad accounts the report covers.
 *
 * Nothing is ticked when an account first appears. An agent who can see six ad
 * accounts — their own, the agency's, a developer's they were given access to — should
 * choose which ones are theirs to report on, rather than have the page silently sum
 * somebody else's spend into their cost-per-lead.
 */
export function AdAccountPicker({ accounts }: { accounts: AdAccountView[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle(id: string, on: boolean) {
    setError(null);
    start(async () => {
      const res = await setAdAccountSelected(id, on);
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      {accounts.map((a) => (
        <label
          key={a.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/50"
        >
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={a.selected}
            disabled={pending}
            onChange={(e) => toggle(a.id, e.target.checked)}
          />
          <span className="min-w-0 flex-1 break-words text-sm">{a.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{a.externalId}</span>
        </label>
      ))}
      {pending && (
        <p className="flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          Saving…
        </p>
      )}
      {error && <p className="px-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
