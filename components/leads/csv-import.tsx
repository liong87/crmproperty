"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { importLeadsFromCsv, type ImportSummary } from "@/server/leads/import";
import { Button } from "@/components/ui/button";

export function CsvImport() {
  const router = useRouter();
  const [text, setText] = React.useState("");
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
      const res = await importLeadsFromCsv(text);
      if (!res.success) return setError(res.error);
      setSummary(res.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-medium">CSV format</p>
        <p className="mt-1 text-muted-foreground">
          First row must be headers. Recognised columns:
          <code className="mx-1 rounded bg-secondary px-1">name</code>
          <code className="mx-1 rounded bg-secondary px-1">phone</code>
          <code className="mx-1 rounded bg-secondary px-1">email</code>
          <code className="mx-1 rounded bg-secondary px-1">interest</code>
          <code className="mx-1 rounded bg-secondary px-1">preferredAreas</code>
          <code className="mx-1 rounded bg-secondary px-1">budgetMin</code>
          <code className="mx-1 rounded bg-secondary px-1">budgetMax</code>.
          Phone must be E.164 (e.g. +60123456789). Budgets in Ringgit.
        </p>
      </div>

      <input type="file" accept=".csv,text/csv" onChange={onFile}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-2 file:text-sm" />

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={"name,phone,email,interest,preferredAreas,budgetMin,budgetMax\nAli,+60123456789,ali@mail.com,buy,Mont Kiara,800000,1200000"}
        className="h-40 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={run} disabled={pending || !text.trim()}>
        {pending ? "Importing…" : "Import leads"}
      </Button>

      {summary && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Import complete</p>
          <p className="mt-1 text-muted-foreground">
            {summary.total} rows · {summary.created} created · {summary.deduped} merged (duplicates) · {summary.failed} failed
          </p>
          {summary.errors.length > 0 && (
            <ul className="mt-2 space-y-1 text-destructive">
              {summary.errors.slice(0, 10).map((e) => (
                <li key={e.row}>Row {e.row}: {e.error}</li>
              ))}
              {summary.errors.length > 10 && <li>…and {summary.errors.length - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
