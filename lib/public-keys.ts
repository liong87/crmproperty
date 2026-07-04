/**
 * PUBLIC_LEAD_API_KEYS format: comma-separated "key:landingPageSlug" pairs.
 * Each landing page gets its own key so leads are attributable and keys are revocable.
 * Example: "devkey123:homepage-form,abc456:mont-kiara-lp"
 */
export function resolveLandingPage(apiKey: string | null): string | null {
  if (!apiKey) return null;
  const raw = process.env.PUBLIC_LEAD_API_KEYS ?? "";
  for (const pair of raw.split(",")) {
    const [key, slug] = pair.split(":").map((s) => s.trim());
    if (key && key === apiKey) return slug || "unknown";
  }
  return null;
}
