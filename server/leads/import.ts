"use server";
/**
 * CSV bulk import (authenticated staff). Each row funnels through the shared
 * createLeadFromIntake pipeline (dedup, round-robin, consent, logging) with
 * source=import.
 *
 * Headers are matched loosely — case, spaces, underscores and hyphens are ignored —
 * so exports from Facebook Lead Ads ("Full Name", "Phone Number") and Google Ads
 * ("CSV for CRM" format) can be imported without editing the file first.
 *
 * Recognised columns (extras ignored):
 *   name | full name         phone | phone number      email
 *   interest                  preferred areas | city    consent
 *   budget min                budget max
 *
 * Budgets are read as whole Ringgit and stored as integer cents. "1,200,000",
 * "RM 850000" and "850k" all work — previously any of those rejected the whole row.
 */
import { requireDbUser, isManagerOrAbove } from "@/lib/auth";
import { createLeadFromIntake } from "./intake";
import { ok, fail } from "@/lib/action-result";
import type { ActionResult } from "@/types";
import { parseCsv, pick, ringgitToCents, toE164My, toInterest, toConsent } from "./csv";

const MAX_ROWS = 1000;

export interface ImportSummary {
  total: number;
  created: number;
  deduped: number;
  failed: number;
  /** `line` is the real line number in the uploaded file. */
  errors: { line: number; name: string; error: string }[];
  /** True when consent was absent for at least one row — see the PDPA note below. */
  missingConsent: number;
}

/**
 * @param distribute  Managers and admins only: spread the imported leads across the
 *                    team by round-robin instead of keeping them.
 *
 * Default is to assign every imported lead to the person importing. An agent
 * importing their own Facebook Lead Ads export has sourced and usually paid for that
 * list; round-robin would scatter it across the team and leave them able to see only
 * a fraction of it. A manager importing a company-wide list wants the opposite, hence
 * the flag — which is ignored for agents, who can only ever assign to themselves.
 */
export async function importLeadsFromCsv(
  csvText: unknown,
  distribute = false,
): Promise<ActionResult<ImportSummary>> {
  try {
    // Any authenticated staff member may import, because imported leads now belong to
    // the importer. Restricting this to managers would leave an agent with their own
    // ad campaign no way to get their leads into the CRM.
    const me = await requireDbUser();
    const spreadAcrossTeam = distribute && isManagerOrAbove(me);
    // undefined = let intake round-robin; otherwise pin to the importer.
    const assignTo = spreadAcrossTeam ? undefined : me.id;

    if (typeof csvText !== "string") return fail("No CSV content provided.");
    if (csvText.length > 5_000_000) return fail("File is too large. Please split it up.");

    const rows = parseCsv(csvText);
    if (rows.length === 0) return fail("No data rows found in the CSV.");
    if (rows.length > MAX_ROWS) {
      return fail(`Please import ${MAX_ROWS} rows or fewer at a time.`);
    }

    const summary: ImportSummary = {
      total: rows.length,
      created: 0,
      deduped: 0,
      failed: 0,
      errors: [],
      missingConsent: 0,
    };

    for (const { line, values } of rows) {
      const name = pick(values, "name", "full name", "fullname");
      const consentCol = pick(values, "consent", "pdpa consent", "pdpa", "agree");

      // PDPA: consent is taken from the file when the column exists. When it does
      // NOT exist we still import (these are leads the agency already holds) but we
      // count it, so the person importing can see how many records carry no consent
      // evidence. The old code stamped consent_given_at = now() on every row
      // unconditionally, manufacturing a consent record that could not be defended.
      const hasConsentColumn = consentCol !== "";
      const consentGiven = hasConsentColumn ? toConsent(consentCol) : false;
      if (!consentGiven) summary.missingConsent++;

      const payload = {
        name,
        phone: toE164My(pick(values, "phone", "phone number", "phonenumber", "mobile")) ?? "",
        email: pick(values, "email", "email address") || null,
        interest: toInterest(pick(values, "interest", "looking for", "type")),
        preferredAreas:
          pick(values, "preferred areas", "preferredareas", "area", "areas", "city") || null,
        budgetMin: ringgitToCents(pick(values, "budget min", "budgetmin", "min budget")),
        budgetMax: ringgitToCents(pick(values, "budget max", "budgetmax", "max budget")),
        consentGiven,
        consentSource: "csv-import",
        sourceDetail: "csv-import",
      };

      const res = await createLeadFromIntake(payload, "import", assignTo);
      if (!res.success) {
        summary.failed++;
        summary.errors.push({ line, name: name || "(no name)", error: res.error });
      } else if (res.data.deduped) summary.deduped++;
      else summary.created++;
    }

    return ok(summary);
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHENTICATED") return fail("Please sign in.");
    if (err instanceof Error && err.message === "INACTIVE_USER") {
      return fail("Your account is awaiting approval.");
    }
    return fail("Import failed.");
  }
}
