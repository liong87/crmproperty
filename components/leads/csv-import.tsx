"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { importLeadsFromCsv, type ImportSummary } from "@/server/leads/import";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FormAlert } from "@/components/ui/alert";

export function CsvImport({ canDistribute = false }: { canDistribute?: boolean }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [distribute, setDistribute] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then(setText);
  }

  function run() {
    setError(null); setSummary(null);
    start(async () => {
      const res = await importLeadsFromCsv(text, distribute);
      if (!res.success) return setError(res.error);
      setSummary(res.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">CSV format</p>
        <div className="mt-1 text-muted-foreground">
          <p>First row must be headers. Recognised columns:</p>
          {/* A wrapping chip row, not inline <code> inside a paragraph: the inline
              version could not break between the chips and pushed the page wider than
              the viewport on a tablet and a phone. */}
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {["name", "phone", "email", "interest", "preferredAreas", "budgetMin", "budgetMax", "consent"].map((c) => (
              <li key={c}>
                <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{c}</code>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Column names are matched loosely, so exports from Facebook Lead Ads (“Full Name”,
            “Phone Number”) and Google Ads work without editing the file. Phone accepts
            012-345 6789 or +60123456789. Budgets accept 850000, “RM 850,000” or 850k.
          </p>
        </div>
      </div>

      {/* Both controls were unlabelled: a file input whose only description is the
          browser's own "Choose file", and a textarea named by a placeholder that
          disappears the moment anything is pasted into it. */}
      <div className="space-y-1.5">
        <Label htmlFor="csv-file">Choose a CSV file</Label>
        <input id="csv-file" type="file" accept=".csv,text/csv" onChange={onFile}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2 file:text-sm" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="csv-text">Or paste the rows here</Label>
        <textarea
          id="csv-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"name,phone,email,interest,preferredAreas,budgetMin,budgetMax\nAli,+60123456789,ali@mail.com,buy,Mont Kiara,800000,1200000"}
          className="h-40 w-full rounded-xl border border-input bg-background p-3 font-mono text-xs focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
        />
      </div>

      {canDistribute ? (
        <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={distribute}
            onChange={(e) => setDistribute(e.target.checked)}
          />
          <span>
            <span className="font-medium">Distribute evenly across agents</span>
            <span className="mt-0.5 block text-muted-foreground">
              For company-wide lists. Leave unticked to keep these leads yourself — which
              is what you want for a list you sourced.
            </span>
          </span>
        </label>
      ) : (
        <p className="text-sm text-muted-foreground">
          Imported leads are assigned to you.
        </p>
      )}

      {error && <FormAlert>{error}</FormAlert>}

      <Button onClick={run} disabled={pending || !text.trim()}>
        {pending ? "Importing…" : "Import leads"}
      </Button>

      {summary && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Import complete</p>
          <p className="mt-1 text-muted-foreground">
            {summary.total} rows · {summary.created} created · {summary.deduped} merged (duplicates) · {summary.failed} failed
          </p>
          {summary.missingConsent > 0 && (
            <p className="text-sm text-amber-700">
              {summary.missingConsent} of {summary.total} rows had no consent column or value.
              They were imported, but carry no PDPA consent record — add a “consent” column
              (yes/no) if the source captured one.
            </p>
          )}
          {summary.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-destructive-ink">
              {summary.errors.slice(0, 10).map((e) => (
                <li key={e.line}>Line {e.line}{e.name !== "(no name)" ? ` (${e.name})` : ""}: {e.error}</li>
              ))}
              {summary.errors.length > 10 && <li>…and {summary.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
