"use server";
/**
 * CSV bulk import (authenticated agents). Each row funnels through the shared
 * createLeadFromIntake pipeline (dedup, round-robin, consent, logging) with source=import.
 *
 * Expected headers (case-insensitive, extra columns ignored):
 *   name, phone, email, interest, preferredAreas, budgetMin, budgetMax
 * Budgets are read as whole Ringgit and stored as integer cents.
 */
import { requireDbUser } from "@/lib/auth";
import { createLeadFromIntake } from "./intake";
import { ok, fail } from "@/lib/action-result";
import type { ActionResult } from "@/types";

export interface ImportSummary {
  total: number;
  created: number;
  deduped: number;
  failed: number;
  errors: { row: number; error: string }[];
}

/** Minimal CSV parser: handles quoted fields and escaped quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }

  if (rows.length === 0) return [];
  const headers = rows[0]!.map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

export async function importLeadsFromCsv(csvText: string): Promise<ActionResult<ImportSummary>> {
  try {
    await requireDbUser(); // any authenticated staff may import
    const rows = parseCsv(csvText);
    if (rows.length === 0) return fail("No data rows found in the CSV.");
    if (rows.length > 1000) return fail("Please import 1000 rows or fewer at a time.");

    const summary: ImportSummary = { total: rows.length, created: 0, deduped: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const rm = (v: string) => (v ? Math.round(Number(v) * 100) : null);
      const payload = {
        name: r["name"] ?? "",
        phone: r["phone"] ?? "",
        email: r["email"] || null,
        interest: (r["interest"] || null) as never,
        preferredAreas: r["preferredareas"] || r["preferred areas"] || null,
        budgetMin: rm(r["budgetmin"] || r["budget min"] || ""),
        budgetMax: rm(r["budgetmax"] || r["budget max"] || ""),
        consentGiven: true,
        consentSource: "csv-import",
        sourceDetail: "csv-import",
      };
      const res = await createLeadFromIntake(payload, "import");
      if (!res.success) {
        summary.failed++;
        summary.errors.push({ row: i + 2, error: res.error }); // +2: header + 1-indexed
      } else if (res.data.deduped) summary.deduped++;
      else summary.created++;
    }

    return ok(summary);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    return fail("Import failed.");
  }
}
