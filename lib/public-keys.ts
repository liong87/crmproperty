/**
 * PUBLIC_LEAD_API_KEYS format: comma-separated "key:landingPageSlug" pairs.
 * Each landing page gets its own key so leads are attributable and keys are revocable.
 * Example: "devkey123:homepage-form,abc456:mont-kiara-lp"
 */
import { timingSafeEqual } from "@/lib/webhooks/verify";

export function resolveLandingPage(apiKey: string | null): string | null {
  if (!apiKey) return null;
  const raw = process.env.PUBLIC_LEAD_API_KEYS ?? "";
  let matched: string | null = null;
  for (const pair of raw.split(",")) {
    // Split on the FIRST colon only. A key containing ':' previously broke the
    // parser silently, which meant a valid key could stop being recognised.
    const sep = pair.indexOf(":");
    const key = (sep === -1 ? pair : pair.slice(0, sep)).trim();
    const slug = (sep === -1 ? "" : pair.slice(sep + 1)).trim();
    // Constant-time compare, and keep scanning the whole list so response time
    // does not reveal how far down the list a key sits.
    if (key && timingSafeEqual(key, apiKey) && matched === null) {
      matched = slug || "unknown";
    }
  }
  return matched;
}
