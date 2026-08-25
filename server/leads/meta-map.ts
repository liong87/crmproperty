/**
 * Mapping a Meta lead form submission onto our intake schema.
 *
 * Kept pure and separate from the network call so it can be tested against real
 * payload shapes — which matters more here than anywhere else in intake, because the
 * field names are chosen by whoever built the ad, not by us, and a mapping mistake
 * silently bins leads the agency paid for.
 */
import type { LeadAdRecord } from "@/lib/leadads";
import { toE164 } from "@/lib/phone";
import { INTEREST } from "@/lib/constants";

export interface MetaMapping {
  projectId: string | null;
  defaultInterest: string | null;
  label: string | null;
}

export interface MappedMetaLead {
  name: string;
  phone: string;
  email: string | null;
  interest: string | null;
  preferredAreas: string | null;
  projectId: string | null;
  sourceDetail: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  /** Ad set name — the level the agency actually turns on and off. */
  utmContent: string | null;
  /** Ad name — which creative produced this lead. */
  utmTerm: string | null;
  consentGiven: boolean;
  consentSource: string;
  /** Answers we did not map to a column, kept so custom questions are not lost. */
  extraAnswers: Record<string, string>;
}

/** Meta's own standard field names, plus the spellings custom forms commonly use. */
const NAME_KEYS = ["full_name", "name", "your_name"];
const FIRST_KEYS = ["first_name", "given_name"];
const LAST_KEYS = ["last_name", "family_name", "surname"];
const PHONE_KEYS = ["phone_number", "phone", "mobile", "mobile_number", "contact_number", "whatsapp"];
const EMAIL_KEYS = ["email", "email_address", "work_email"];
const AREA_KEYS = ["city", "preferred_area", "area", "location", "preferred_location", "state"];
const INTEREST_KEYS = ["interest", "i_am_looking_to", "looking_to", "purpose", "buy_or_rent"];
const CONSENT_KEYS = ["consent", "pdpa", "i_agree", "agree", "consent_to_contact", "pdpa_consent"];

/** Every key consumed above — anything else is a custom question worth keeping. */
const KNOWN = new Set([
  ...NAME_KEYS, ...FIRST_KEYS, ...LAST_KEYS, ...PHONE_KEYS,
  ...EMAIL_KEYS, ...AREA_KEYS, ...INTEREST_KEYS, ...CONSENT_KEYS,
]);

function pick(fields: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = fields[k];
    if (v && v.trim()) return v.trim();
  }
  return null;
}

/** Meta answers are free text; only map onto our vocabulary when it clearly matches. */
function asInterest(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if ((INTEREST as readonly string[]).includes(v)) return v;
  if (/\b(buy|purchase|own|beli)\b/.test(v)) return "buy";
  if (/\b(rent|lease|sewa)\b/.test(v)) return "rent";
  if (/\b(sell|jual)\b/.test(v)) return "sell";
  if (/\b(invest|investment|pelaburan)\b/.test(v)) return "invest";
  return null;
}

function asConsent(raw: string | null): boolean {
  if (!raw) return false;
  return ["yes", "y", "true", "1", "agree", "agreed", "setuju", "ya", "on"].includes(
    raw.trim().toLowerCase(),
  );
}

export function mapMetaLead(record: LeadAdRecord, mapping: MetaMapping | null): MappedMetaLead {
  const f = record.fields;

  const full = pick(f, NAME_KEYS);
  const first = pick(f, FIRST_KEYS);
  const last = pick(f, LAST_KEYS);
  const name = full ?? [first, last].filter(Boolean).join(" ").trim();

  // Meta returns whatever the user typed. Normalising here rather than rejecting is
  // the difference between capturing a paid lead and binning it.
  const phone = toE164(pick(f, PHONE_KEYS)) ?? "";

  const consentAnswer = pick(f, CONSENT_KEYS);

  const extraAnswers: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!KNOWN.has(k)) extraAnswers[k] = v;
  }

  return {
    name,
    phone,
    email: pick(f, EMAIL_KEYS),
    interest: asInterest(pick(f, INTEREST_KEYS)) ?? mapping?.defaultInterest ?? null,
    preferredAreas: pick(f, AREA_KEYS),
    projectId: mapping?.projectId ?? null,
    // The label an admin gave the form reads far better in a list than a numeric id.
    sourceDetail: (mapping?.label ?? `meta form ${record.formId ?? "unknown"}`).slice(0, 255),
    utmSource: "meta",
    utmMedium: "paid-social",
    // Campaign NAME, not id — this is what cost-per-lead reporting is grouped by.
    utmCampaign: (record.campaignName ?? record.campaignId)?.slice(0, 255) ?? null,
    // The provider already asks Meta for adset_name and ad_name; until now they were
    // fetched and thrown away. Ad set has no id fallback because the Graph fields we
    // request carry no adset_id — a name or nothing. Ad falls back to its id, matching
    // how campaign behaves above.
    utmContent: record.adsetName?.slice(0, 255) ?? null,
    utmTerm: (record.adName ?? record.adId)?.slice(0, 255) ?? null,
    /**
     * PDPA. If the form asks a consent question we honour the answer, which is the
     * only genuinely defensible basis. If it does not, we fall back to true and record
     * exactly what that claim rests on — Meta requires a privacy policy link on every
     * lead form and the user submitted knowing it. That mirrors the existing Google Ads
     * decision. If the agency wants firmer ground, add a consent checkbox to the Meta
     * form and this will use it automatically.
     */
    consentGiven: consentAnswer !== null ? asConsent(consentAnswer) : true,
    consentSource:
      consentAnswer !== null
        ? `meta:form-consent-question:${record.formId ?? "unknown"}`
        : `meta:form-privacy-policy:${record.formId ?? "unknown"}`,
    extraAnswers,
  };
}
