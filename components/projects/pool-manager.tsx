"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { addPoolMember, setPoolMemberActive, movePoolMember, removePoolMember } from "@/server/projects/pool-actions";
import type { PoolRow } from "@/server/projects/queries";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

/**
 * Who receives this project's leads, and in what order.
 *
 * The order is the rotation. "Paused" keeps somebody on the list without giving them
 * new leads — the common case of an agent on leave, where removing them entirely would
 * lose their place and their history.
 */
export function PoolManager({
  projectId, pool, agents, canEdit, passOnAfterDays,
}: {
  projectId: string;
  pool: PoolRow[];
  agents: { id: string; name: string }[];
  canEdit: boolean;
  passOnAfterDays: number | null;
}) {
  const router = useRouter();
  const [pick, setPick] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const inPool = new Set(pool.map((p) => p.userId));
  const available = agents.filter((a) => !inPool.has(a.id));
  const activeCount = pool.filter((p) => p.active).length;

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {pool.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No pool yet. Leads for this project go into the agency-wide rotation, the same as before.
        </p>
      ) : (
        <ol className="space-y-2">
          {pool.map((m, i) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-secondary text-xs font-medium text-primary tnum">
                  {i + 1}
                </span>
                <span className="font-medium">{m.name}</span>
                {!m.active && <Badge className="bg-muted text-muted-foreground">paused</Badge>}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${m.name} up`}
                    title="Move up"
                    disabled={pending || i === 0}
                    onClick={() => run(() => movePoolMember(m.id, "up"))}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${m.name} down`}
                    title="Move down"
                    disabled={pending || i === pool.length - 1}
                    onClick={() => run(() => movePoolMember(m.id, "down"))}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => setPoolMemberActive(m.id, !m.active))}
                  >
                    {m.active ? "Pause" : "Resume"}
                  </Button>
                  {/* Removing loses their place in the rotation and their history with
                      it — which is precisely what Pause exists to avoid. Ask first, and
                      name the person, because the buttons in this row all look alike. */}
                  <ConfirmButton
                    onConfirm={() => run(() => removePoolMember(m.id))}
                    question={`Remove ${m.name} from the pool?`}
                    confirmLabel="Remove"
                    pending={pending}
                  >
                    Remove
                  </ConfirmButton>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-muted-foreground">
        {passOnAfterDays
          ? activeCount > 1
            ? `Agency leads — from Meta, the website or the API — with nothing logged for ${passOnAfterDays} days pass to the next person in this list. Leads an agent entered or imported themselves stay theirs. Both agents are told, and every hand-over is recorded on the lead.`
            : `Pass-on is set to ${passOnAfterDays} days, but a pool of one has nobody to pass to. Add a second person, or the setting does nothing.`
          : "Pass-on is off for this project. Set it on the project's edit page to move stalled leads on automatically."}
      </p>

      {error && <FormAlert>{error}</FormAlert>}

      {canEdit && available.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Select aria-label="Add someone to this pool" className="h-9 w-56" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Add someone…</option>
            {available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !pick}
            onClick={() => run(async () => { const r = await addPoolMember(projectId, pick); if (r.success) setPick(""); return r; })}
          >
            Add to pool
          </Button>
        </div>
      )}
    </div>
  );
}
