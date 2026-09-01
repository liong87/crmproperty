/**
 * Active lead-ads provider. Swapping platforms is this file plus one new provider.
 */
import type { LeadAdsProvider, LeadFormsProvider } from "./interface";
import { MetaLeadAdsProvider } from "./meta-provider";
import { MetaLeadFormsProvider } from "./meta-forms";

export const metaLeadAds: LeadAdsProvider = new MetaLeadAdsProvider();

/** Reading and creating the forms themselves — an admin screen, not the webhook path. */
export const metaLeadForms: LeadFormsProvider = new MetaLeadFormsProvider();

export { LeadAdsTransientError } from "./interface";
export type {
  LeadAdRecord,
  LeadAdsProvider,
  LeadFormsProvider,
  RemoteLeadForm,
  RemoteFormQuestion,
  LeadFormQuestion,
  CreateLeadFormInput,
} from "./interface";
