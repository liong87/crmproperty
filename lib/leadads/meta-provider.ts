/**
 * Meta (Facebook / Instagram) Lead Ads.
 *
 * Uses `fetch` against the Graph API rather than the Facebook SDK, deliberately: the
 * SDK is large, Node-only, and this has to run on Cloudflare Workers. Two env vars:
 *
 * The Page token is passed in, not read from the environment: the connected Page now
 * lives in the database (see server/lead-sources/credentials.ts), which still falls
 * back to META_PAGE_ACCESS_TOKEN. META_GRAPH_VERSION is optional and defaults below.
 *
 * The App Secret used to verify the webhook signature lives under the existing
 * webhook convention (WEBHOOK_SECRET_META) so all inbound secrets stay in one place.
 */
import {
  LeadAdsTransientError,
  type AdPlatformCredentials,
  type LeadAdRecord,
  type LeadAdsProvider,
} from "./interface";

const DEFAULT_VERSION = "v21.0";

/**
 * Asking for campaign and ad NAMES here saves a second round trip later.
 * Cost-per-lead reporting needs the campaign name, and the id alone is unreadable.
 */
const FIELDS = [
  "id",
  "created_time",
  "form_id",
  "ad_id",
  "ad_name",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "field_data",
].join(",");

interface GraphLead {
  id?: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
}

export class MetaLeadAdsProvider implements LeadAdsProvider {
  async fetchLead(
    { token }: AdPlatformCredentials,
    externalId: string,
  ): Promise<LeadAdRecord | null> {
    const version = process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(externalId)}?fields=${FIELDS}&access_token=${encodeURIComponent(token)}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new LeadAdsTransientError(`Graph API unreachable: ${(err as Error).message}`);
    }

    if (res.status === 404) return null; // Genuinely gone; retrying will not help.
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 400 with an OAuth subcode is an expired token — still worth retrying, because
      // the fix is a config change rather than a different payload.
      throw new LeadAdsTransientError(`Graph API ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as GraphLead;

    const fields: Record<string, string> = {};
    for (const f of data.field_data ?? []) {
      const key = String(f?.name ?? "").trim().toLowerCase();
      if (!key) continue;
      // Multi-select answers arrive as an array; join rather than dropping the extras.
      const value = (f?.values ?? []).filter(Boolean).join(", ");
      if (value) fields[key] = value;
    }

    const createdAt = data.created_time ? new Date(data.created_time) : null;

    return {
      externalId: data.id ?? externalId,
      formId: data.form_id ?? null,
      fields,
      campaignId: data.campaign_id ?? null,
      campaignName: data.campaign_name ?? null,
      adId: data.ad_id ?? null,
      adName: data.ad_name ?? null,
      adsetName: data.adset_name ?? null,
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
    };
  }
}
