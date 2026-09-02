/**
 * Provider-agnostic contract for ad-platform lead retrieval.
 *
 * The distinguishing feature of this channel, and the reason it needs an adapter at
 * all: Meta's webhook does NOT contain the lead. It carries a `leadgen_id` and expects
 * you to call back to the Graph API for the answers. Tally and Typeform push the data;
 * Meta pushes a receipt. Anything else in this shape (TikTok, LinkedIn) fits here too.
 */

export interface LeadAdRecord {
  /** The provider's id for this submission. */
  externalId: string;
  /** The form it came from — what maps to a project. */
  formId: string | null;
  /** Answers, keyed by the provider's field name, already flattened to single values. */
  fields: Record<string, string>;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  adName: string | null;
  adsetName: string | null;
  createdAt: Date | null;
}

export interface LeadAdsProvider {
  /**
   * Retrieve one submission.
   *
   * Throws on transient failure (network, rate limit, expired token) so the caller can
   * answer the webhook with a 5xx and let the platform retry. Returns null only when
   * the record genuinely does not exist, which retrying will never fix.
   */
  fetchLead(cred: AdPlatformCredentials, externalId: string): Promise<LeadAdRecord | null>;
}

/** Thrown for failures a retry might fix. */
export class LeadAdsTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadAdsTransientError";
  }
}

/* ---------- form management ---------- */

/**
 * A lead form as the ad platform describes it.
 *
 * `leadsCount` is the platform's own total for the form's whole life, not our count —
 * a gap between the two is the honest signal that leads were submitted while our
 * webhook was down, which is worth being able to see.
 */
export interface RemoteLeadForm {
  id: string;
  name: string;
  /** Meta: DRAFT | ACTIVE | ARCHIVED. Null when the platform does not say. */
  status: string | null;
  leadsCount: number | null;
  createdAt: Date | null;
}

/** One question on a form we are creating. */
export type LeadFormQuestion =
  | { type: "FULL_NAME" | "EMAIL" | "PHONE" }
  | { type: "CUSTOM"; key: string; label: string; options?: string[] };

export interface CreateLeadFormInput {
  name: string;
  questions: LeadFormQuestion[];
  /** Meta REQUIRES a reachable privacy policy URL. There is no way around this. */
  privacyPolicyUrl: string;
  privacyLinkText?: string;
  /** Where "View website" sends them after submitting. */
  followUpUrl?: string;
  /** Headline and body shown before the questions. Both or neither. */
  introHeadline?: string;
  introBody?: string;
}

/** One question as the platform defines it. `key` is what appears in a lead's answers. */
export interface RemoteFormQuestion {
  key: string;
  label: string;
  /** Platform's own type, e.g. FULL_NAME, PHONE, CUSTOM. Null when not reported. */
  type: string | null;
}

/**
 * Reading and creating forms on the ad platform.
 *
 * Split from LeadAdsProvider on purpose: retrieving a lead is on the critical path of
 * a webhook that must answer in seconds, while this is an admin screen. A provider
 * can implement one without the other.
 */
export interface AdPlatformCredentials {
  /** Page id, ad account id — whatever the platform calls the thing being acted for. */
  accountId: string;
  token: string;
}

export interface LeadFormsProvider {
  listForms(cred: AdPlatformCredentials): Promise<RemoteLeadForm[]>;
  /** The questions on one form — what a field mapping is chosen FROM. */
  listQuestions(cred: AdPlatformCredentials, formId: string): Promise<RemoteFormQuestion[]>;
  createForm(cred: AdPlatformCredentials, input: CreateLeadFormInput): Promise<RemoteLeadForm>;
}
