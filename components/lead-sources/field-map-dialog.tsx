"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { loadFormQuestions, saveFieldMap } from "@/server/lead-sources/meta-forms";
import { MAPPABLE_FIELDS, type LeadFieldMap } from "@/lib/lead-forms/field-map";
import type { RemoteFormQuestion } from "@/lib/leadads";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Which question on a Facebook form answers which of our fields.
 *
 * Only worth opening for a form that asks something unexpected. Meta's standard
 * questions are already understood, so the honest default is "guess", and this screen
 * says as much rather than demanding six selections from someone whose form is fine.
 */
export function FieldMapDialog({
  sourceId, label, current,
}: {
  sourceId: string;
  label: string;
  current: LeadFieldMap | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [questions, setQuestions] = React.useState<RemoteFormQuestion[] | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onOpen() {
    setOpen(true);
    setError(null);
    setDraft({ ...(current ?? {}) } as Record<string, string>);
    if (questions) return; // Questions are immutable once a form exists — fetch once.
    start(async () => {
      const res = await loadFormQuestions(sourceId);
      if (!res.success) return setError(res.error ?? "Could not read the form.");
      setQuestions(res.data);
    });
  }

  function onSave() {
    setError(null);
    start(async () => {
      const res = await saveFieldMap({ id: sourceId, fieldMap: draft });
      if (!res.success) return setError(res.error ?? "Something went wrong.");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
        {current && Object.keys(current).length > 0 ? "Fields mapped" : "Map fields"}
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {questions ? `${questions.length} question${questions.length === 1 ? "" : "s"} on this form` : "Reading the form…"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {questions && (
        <>
          <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Leave a field on <strong className="font-medium text-foreground">Guess</strong> unless it is
            getting it wrong. Meta&rsquo;s standard name, phone and email questions are already
            understood — this is for forms that ask in different words.
          </p>

          {questions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Facebook reports no questions on this form. Nothing to map.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {MAPPABLE_FIELDS.map((f) => (
                <div key={f.key} className="grid gap-1 sm:grid-cols-[160px_1fr] sm:items-center sm:gap-3">
                  <div>
                    <Label htmlFor={`fm-${f.key}`}>
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <p className="text-xs text-muted-foreground">{f.hint}</p>
                  </div>
                  <Select
                    id={`fm-${f.key}`}
                    value={draft[f.key] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                    }
                  >
                    <option value="">Guess from the question name</option>
                    {questions.map((q) => (
                      <option key={q.key} value={q.key}>
                        {q.label} ({q.key})
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={onSave} disabled={pending}>
              {pending ? "Saving…" : "Save mapping"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft({})} disabled={pending}>
              Clear all
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
