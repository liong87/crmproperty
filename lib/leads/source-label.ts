/**
 * What to CALL a lead's source on screen.
 *
 * `leads.source` records the TRANSPORT — api, webhook, manual, import — which is a fact
 * about plumbing, not about marketing. "Webhook" tells an agent nothing; they want to
 * know it came from Meta. The origin is already captured in `utmSource` (set to "meta"
 * for every Meta lead) and, failing that, in the first word of `sourceDetail`.
 *
 * So: prefer the origin, fall back to a human word for the transport, and never show
 * the word "webhook" to somebody selling houses.
 */
const TRANSPORT_LABEL: Record<string, string> = {
  manual: "Added by hand",
  import: "CSV import",
  api: "Website",
  webhook: "Integration",
};

const KNOWN_ORIGINS: Record<string, string> = {
  meta: "Meta",
  facebook: "Meta",
  instagram: "Instagram",
  google: "Google",
  googleads: "Google Ads",
  tiktok: "TikTok",
  tally: "Tally",
  typeform: "Typeform",
  generic: "Integration",
};

const titleCase = (v: string) =>
  v.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function sourceLabel(
  source: string,
  utmSource: string | null,
  sourceDetail: string | null,
): string {
  const origin = utmSource?.trim().toLowerCase();
  if (origin) return KNOWN_ORIGINS[origin] ?? titleCase(origin);

  // "meta form 1613980423612055" — the provider is the first word.
  const firstWord = sourceDetail?.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstWord && KNOWN_ORIGINS[firstWord]) return KNOWN_ORIGINS[firstWord];

  return TRANSPORT_LABEL[source] ?? titleCase(source);
}
