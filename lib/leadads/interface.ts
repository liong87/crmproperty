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
  /** True when the provider has the credentials it needs. Never throws. */
  isConfigured(): boolean;
  /**
   * Retrieve one submission.
   *
   * Throws on transient failure (network, rate limit, expired token) so the caller can
   * answer the webhook with a 5xx and let the platform retry. Returns null only when
   * the record genuinely does not exist, which retrying will never fix.
   */
  fetchLead(externalId: string): Promise<LeadAdRecord | null>;
}

/** Thrown for failures a retry might fix. */
export class LeadAdsTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadAdsTransientError";
  }
}
