"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addChecklistItem, setChecklistDue, setChecklistDone, removeChecklistItem,
  uploadChecklistFile, getChecklistFileUrl,
} from "@/server/deal-documents/actions";
import type { ChecklistItem } from "@/server/deal-documents/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { STATUS } from "@/lib/chart-colors";
import { isoToLocalInput } from "@/lib/utils";

const dateFmt = new Intl.DateTimeFormat("en-MY", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur",
});

/** A date input gives "YYYY-MM-DD" with no zone. Malaysia is UTC+8 all year. */
function dateToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * How a deadline reads at a glance.
 *
 * Overdue is deliberately the loudest thing on the page: an expired loan approval is
 * the single most common preventable way a booking collapses, and it fails silently.
 */
function dueTone(item: ChecklistItem): { text: string; color?: string } {
  if (item.completedAt) return { text: "Done", color: STATUS.good };
  if (item.dueAt == null) return { text: "No date" };
  const d = item.daysUntilDue!;
  if (d < 0) return { text: `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`, color: STATUS.critical };
  if (d === 0) return { text: "Due today", color: STATUS.serious };
  if (d <= 7) return { text: `Due in ${d} day${d === 1 ? "" : "s"}`, color: STATUS.warning };
  return { text: `Due ${dateFmt.format(item.dueAt)}` };
}

export function DealChecklist({
  dealId, items, canEdit,
}: {
  dealId: string;
  items: ChecklistItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [newLabel, setNewLabel] = React.useState("");
  const [pending, start] = React.useTransition();

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  async function openFile(itemId: string) {
    setError(null);
    const res = await getChecklistFileUrl(itemId);
    if (!res.success) return setError(res.error);
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  }

  const outstanding = items.filter((i) => !i.completedAt && i.required).length;
  const overdue = items.filter((i) => !i.completedAt && (i.daysUntilDue ?? 0) < 0 && i.dueAt).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {items.filter((i) => i.completedAt).length} of {items.length} complete
        </span>
        {outstanding > 0 && <span className="text-muted-foreground">· {outstanding} required outstanding</span>}
        {overdue > 0 && (
          <span className="font-semibold" style={{ color: STATUS.critical }}>
            · {overdue} overdue
          </span>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No checklist on this deal. It is created from the pipeline&rsquo;s template when a deal
          is made — add items by hand below if this one predates that.
        </p>
      )}

      <ul className="space-y-2">
        {items.map((item) => {
          const tone = dueTone(item);
          return (
            <li key={item.id} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0"
                    checked={item.completedAt != null}
                    disabled={pending || !canEdit}
                    onChange={(e) => run(() => setChecklistDone(item.id, e.target.checked))}
                    aria-label={`Mark ${item.label} complete`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={item.completedAt ? "text-muted-foreground line-through" : "font-medium"}>
                        {item.label}
                      </span>
                      {item.required && !item.completedAt && <Badge variant="outline">required</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs" style={tone.color ? { color: tone.color } : undefined}>
                      <span className={tone.color ? "font-semibold" : "text-muted-foreground"}>{tone.text}</span>
                    </div>
                    {item.notes && (
                      <p className="mt-1 max-w-prose text-xs text-muted-foreground">{item.notes}</p>
                    )}
                    {item.filename && (
                      <button
                        type="button"
                        onClick={() => openFile(item.id)}
                        className="mt-1 text-xs text-primary underline underline-offset-2"
                      >
                        {item.filename}
                      </button>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Due</Label>
                      <Input
                        type="date"
                        className="h-9 w-40"
                        defaultValue={item.dueAt ? isoToLocalInput(item.dueAt).slice(0, 10) : ""}
                        disabled={pending}
                        onChange={(e) => run(() => setChecklistDue({ id: item.id, dueAt: dateToIso(e.target.value) }))}
                      />
                    </div>
                    <label className="cursor-pointer text-xs text-primary underline underline-offset-2">
                      {item.filename ? "Replace file" : "Attach file"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={pending}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const fd = new FormData();
                          fd.set("itemId", item.id);
                          fd.set("file", f);
                          run(() => uploadChecklistFile(fd));
                        }}
                      />
                    </label>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeChecklistItem(item.id))}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Add an item</Label>
            <Input
              className="h-9 w-64"
              placeholder="Developer&rsquo;s confirmation letter"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !newLabel.trim()}
            onClick={() =>
              run(async () => {
                const r = await addChecklistItem({ dealId, label: newLabel });
                if (r.success) setNewLabel("");
                return r;
              })
            }
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
