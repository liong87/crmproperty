/**
 * Active lead-ads provider. Swapping platforms is this file plus one new provider.
 */
import type { LeadAdsProvider } from "./interface";
import { MetaLeadAdsProvider } from "./meta-provider";

export const metaLeadAds: LeadAdsProvider = new MetaLeadAdsProvider();

export { LeadAdsTransientError } from "./interface";
export type { LeadAdRecord, LeadAdsProvider } from "./interface";
