"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { assignLead } from "@/server/leads/actions";
import type { StaleLeadRow } from "@/server/leads/stale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const fmt = (d: Date | null) =>
  d == null
    ? "never"
    : new Date(d).toLocaleString("en-MY", {
        timeZone: "Asia/Kuala_Lumpur",
        dateStyle: "medium",
      });

/** Older than a month is a different kind of problem from older than a fortnight. */
function tone(idleDays: number): string {
  if (idleDays >= 45) return "bg-destructive/10 text-destructive";
  if (idleDays >= 30) return "bg-amber-100 text-amber-800";
  return "bg-muted text-muted-foreground";
}

export function StaleLeadList({
  leads,
  agents,
  canReassign,
}: {
  leads: StaleLeadRow[];
  agents: Array<{ id: string; name: string }>;
  /** Team leads and admins only — the action enforces the same rule. */
  canReassign: boolean;
}) {
  const router = useRouter();
  const [openFor, setOpenFor] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function submit(leadId: string) {
    if (!target) return setError("Pick who it goes to.");
    setError(null);
    start(async () => {
      const res = await assignLead(leadId, target, reason);
      if (!res.success) return setError(res.error ?? "Could not reassign.");
      setOpenFor(null);
      setTarget("");
      setReason("");
      router.refresh();
    });
  }

  if (leads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing going cold. Every open lead has been touched recently.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {leads.map((l) => (
        <div key={l.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                  {l.name}
                </Link>
                <Badge className={tone(l.idleDays)}>{l.idleDays} days quiet</Badge>
                <Badge variant="outline">{l.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {l.phone} · {l.assignedName ?? "Unassigned"} · last activity {fmt(l.lastActivityAt)}
              </p>
            </div>

            {canReassign && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setOpenFor(openFor === l.id ? null : l.id)}
              >
                {openFor === l.id ? "Cancel" : "Reassign"}
              </Button>
            )}
          </div>

          {canReassign && openFor === l.id && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
              <Select
                className="h-9 w-48"
                value={target}
                disabled={pending}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Move to…</option>
                {agents
                  .filter((a) => a.id !== l.assignedTo)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </Select>
              <Input
                className="h-9 w-64"
                placeholder="Reason (recorded on the lead)"
                value={reason}
                disabled={pending}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button size="sm" disabled={pending} onClick={() => submit(l.id)}>
                {pending ? "Moving…" : "Confirm"}
              </Button>
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
