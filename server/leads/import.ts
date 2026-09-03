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
import { requireDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { and, asc, inArray, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { leads } from "@/lib/db/schema";
import { DEAD_STATUSES } from "@/lib/constants";
import { createLeadFromIntake, knownEmailKey, knownPhoneKey } from "./intake";
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
 * @param distribute  Team leads and admins only: spread the imported leads across the
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
    // the importer. Restricting this to team leads would leave an agent with their own
    // ad campaign no way to get their leads into the CRM.
    const me = await requireDbUser();
    const spreadAcrossTeam = distribute && isTeamLeadOrAbove(me);
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

    /*
     * ONE dedupe query for the file, not one per row.
     *
     * Every row used to run its own "is this person already here?" SELECT. A 1,000-row
     * import therefore made 1,000 round trips before it inserted anything, on a
     * runtime billed by CPU time and bounded by a request deadline — which is the most
     * likely reason a large import would time out half-finished.
     *
     * The index is passed into `createLeadFromIntake`, which mutates it as rows are
     * created, so a file listing the same person twice still dedupes the second
     * occurrence. Semantics are unchanged; the number of queries is not.
     */
    const parsedRows = rows.map(({ line, values }) => ({
      line,
      values,
      phone: toE164My(pick(values, "phone", "phone number", "phonenumber", "mobile")) ?? "",
      email: pick(values, "email", "email address") || null,
    }));

    const phones = [...new Set(parsedRows.map((r) => r.phone).filter(Boolean))];
    const emails = [...new Set(parsedRows.map((r) => r.email).filter((e): e is string => !!e))];

    const known = new Map<string, { id: string }>();
    if (phones.length > 0 || emails.length > 0) {
      const matchers = [
        phones.length > 0 ? inArray(leads.phone, phones) : undefined,
        emails.length > 0 ? inArray(leads.email, emails) : undefined,
      ].filter(Boolean);

      const existing = await db
        .select({
          id: leads.id,
          phone: leads.phone,
          email: leads.email,
          createdAt: leads.createdAt,
        })
        .from(leads)
        .where(
          and(
            isNull(leads.deletedAt),
            isNull(leads.convertedToContactId),
            notInArray(leads.status, DEAD_STATUSES),
            matchers.length === 1 ? matchers[0] : or(...matchers),
          ),
        )
        // Oldest first, so the newest row overwrites and the map ends up holding the
        // most recent match — the same lead the per-row query's ORDER BY chose.
        .orderBy(asc(leads.createdAt));

      for (const row of existing) {
        known.set(knownPhoneKey(row.phone), { id: row.id });
        if (row.email) known.set(knownEmailKey(row.email), { id: row.id });
      }
    }

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
        // Ad-platform exports carry the attribution the spend report needs, and it was
        // being dropped on the floor. Facebook's Lead Ads export uses campaign_name /
        // adset_name / ad_name; Google's uses campaign / ad group; a hand-built sheet
        // usually uses the utm_ spellings. Accept all three rather than asking anyone
        // to rename columns before importing.
        utmSource: pick(values, "utm source", "utmsource", "source", "platform") || null,
        utmMedium: pick(values, "utm medium", "utmmedium", "medium") || null,
        utmCampaign:
          pick(values, "campaign name", "campaignname", "campaign", "utm campaign", "utmcampaign") ||
          null,
        utmContent:
          pick(values, "adset name", "adsetname", "ad set name", "ad set", "adset", "ad group", "adgroup", "utm content", "utmcontent") ||
          null,
        utmTerm:
          pick(values, "ad name", "adname", "ad", "creative", "utm term", "utmterm") || null,
      };

      /*
       * `notify: false`. An import must not message the agent once per row — a 500-row
       * file produced 500 "New lead assigned" WhatsApp notifications, and a `users`
       * lookup plus an outbound request each time.
       */
      const res = await createLeadFromIntake(payload, "import", assignTo, {
        notify: false,
        known,
      });
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
