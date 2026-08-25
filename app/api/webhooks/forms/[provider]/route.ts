import { NextResponse } from "next/server";
import { createLeadFromIntake } from "@/server/leads/intake";
import { INTEREST } from "@/lib/constants";
import { hmacBase64, hmacHex, providerSecret, timingSafeEqual } from "@/lib/webhooks/verify";
import { extractLeadgenChanges, ingestMetaLeadgen } from "@/server/leads/meta";
import { LeadAdsTransientError } from "@/lib/leadads";
import { monitoring } from "@/lib/monitoring";
import { clientIp, withinRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook receiver for form and ad-platform lead sources.
 *
 *   POST /api/webhooks/forms/tally
 *   POST /api/webhooks/forms/typeform
 *   POST /api/webhooks/forms/googleads
 *   POST /api/webhooks/forms/meta
 *   POST /api/webhooks/forms/generic
 *
 * Every provider is mapped onto our intake schema and funnelled through the same
 * createLeadFromIntake pipeline (dedup, round-robin assignment, consent, logging).
 *
 * AUTHENTICATION: every request is verified before any work happens, and an
 * unconfigured provider is REJECTED rather than trusted. Configure one secret per
 * provider as WEBHOOK_SECRET_<PROVIDER> (see lib/webhooks/verify.ts).
 *
 *   tally      HMAC-SHA256(base64) of the raw body in `tally-signature`
 *   typeform   HMAC-SHA256(base64) of the raw body in `typeform-signature` (sha256=...)
 *   googleads  shared `google_key` inside the JSON body (Google's own scheme)
 *   meta       HMAC-SHA256(hex) of the raw body in `x-hub-signature-256` (sha256=...),
 *              keyed by the Meta APP SECRET. Meta also requires a GET handshake — see
 *              the GET handler below.
 *   generic    shared secret in the `x-webhook-secret` header
 */

type Mapped = Record<string, unknown>;

const asInterest = (v: unknown) =>
  typeof v === "string" && (INTEREST as readonly string[]).includes(v.trim().toLowerCase())
    ? v.trim().toLowerCase()
    : null;

/** Truthy only for values that genuinely express consent. Never defaults to true. */
const asConsent = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "yes", "y", "1", "on", "agree"].includes(v.trim().toLowerCase());
  return false;
};

/** Flatten Tally's `data.fields[]` (label/value) into a simple {label: value} map. */
function fromTally(body: any): Mapped {
  const out: Record<string, unknown> = {};
  const fields = body?.data?.fields ?? [];
  for (const f of fields) {
    const key = String(f.label ?? f.key ?? "").toLowerCase();
    out[key] = f.value;
  }
  return {
    name: out["name"] ?? out["full name"] ?? "",
    phone: out["phone"] ?? out["phone number"] ?? "",
    email: out["email"] ?? null,
    interest: asInterest(out["interest"]),
    preferredAreas: out["preferred area"] ?? out["area"] ?? null,
    // Consent must come from the form, not be assumed.
    consentGiven: asConsent(out["consent"] ?? out["pdpa"] ?? out["i agree"]),
  };
}

/** Typeform posts `form_response.answers[]` with typed fields. */
function fromTypeform(body: any): Mapped {
  const answers = body?.form_response?.answers ?? [];
  const byType: Record<string, unknown> = {};
  let consent = false;
  for (const a of answers) {
    if (a.type === "phone_number") byType.phone = a.phone_number;
    else if (a.type === "email") byType.email = a.email;
    else if (a.type === "text" && !byType.name) byType.name = a.text;
    else if (a.type === "choice") byType.interest = a.choice?.label;
    else if (a.type === "boolean") consent = consent || a.boolean === true;
  }
  return {
    name: byType.name ?? "",
    phone: byType.phone ?? "",
    email: byType.email ?? null,
    interest: asInterest(byType.interest),
    consentGiven: consent,
  };
}

/**
 * Google Ads lead form webhook.
 * Fields arrive as user_column_data[] of {column_id, string_value}.
 * Delivery is NOT exactly-once, so `lead_id` is carried through for dedup.
 */
function fromGoogleAds(body: any): Mapped {
  const cols: Record<string, string> = {};
  for (const c of body?.user_column_data ?? []) {
    if (c?.column_id) cols[String(c.column_id).toLowerCase()] = String(c.string_value ?? "");
  }
  const first = cols["first_name"] ?? "";
  const last = cols["last_name"] ?? "";
  return {
    name: cols["full_name"] || [first, last].filter(Boolean).join(" ") || "",
    phone: cols["phone_number"] ?? "",
    email: cols["email"] ?? null,
    interest: asInterest(cols["interest"] ?? cols["what_are_you_looking_for"]),
    preferredAreas: cols["preferred_area"] ?? cols["city"] ?? null,
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: body?.campaign_id ? String(body.campaign_id) : null,
    // Ids, not names — Google's lead-form webhook sends no names, unlike Meta's Graph
    // API. Reporting shows them as-is rather than inventing a label; whoever reads the
    // spend report can match an ad group id against Google Ads if they need to.
    utmContent: body?.adgroup_id ? String(body.adgroup_id) : null,
    utmTerm: body?.creative_id ? String(body.creative_id) : null,
    // Google lead forms include their own consent/disclosure step.
    consentGiven: true,
    externalLeadId: body?.lead_id ? String(body.lead_id) : null,
  };
}

/** Generic: assume the body already uses our field names. */
function fromGeneric(body: any): Mapped {
  const b = { ...(body ?? {}) };
  b.consentGiven = asConsent(b.consentGiven);
  return b;
}

/**
 * Verify the request. Throws nothing — returns an error response, or null when OK.
 * Reads the raw body text because HMAC must be computed over the exact bytes sent.
 */
async function authorize(
  provider: string,
  req: Request,
  rawBody: string,
): Promise<NextResponse | null> {
  const secret = providerSecret(provider);
  if (!secret) {
    // Fail closed. A provider with no configured secret is not trusted.
    monitoring.captureMessage("Webhook rejected: no secret configured", { provider });
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 403 });
  }

  if (provider === "tally") {
    const sig = req.headers.get("tally-signature") ?? "";
    const expected = await hmacBase64(secret, rawBody);
    return timingSafeEqual(sig, expected) ? null : unauthorized(provider);
  }

  if (provider === "typeform") {
    const header = req.headers.get("typeform-signature") ?? "";
    const sig = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
    const expected = await hmacBase64(secret, rawBody);
    return timingSafeEqual(sig, expected) ? null : unauthorized(provider);
  }

  if (provider === "googleads") {
    // Google sends the shared key inside the payload rather than as a header.
    let key = "";
    try {
      key = String(JSON.parse(rawBody)?.google_key ?? "");
    } catch {
      key = "";
    }
    return timingSafeEqual(key, secret) ? null : unauthorized(provider);
  }

  if (provider === "meta") {
    // Meta signs with the APP SECRET, hex-encoded, prefixed "sha256=".
    const header = req.headers.get("x-hub-signature-256") ?? "";
    const sig = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
    const expected = await hmacHex(secret, rawBody);
    return timingSafeEqual(sig.toLowerCase(), expected) ? null : unauthorized(provider);
  }

  const provided = req.headers.get("x-webhook-secret") ?? "";
  return timingSafeEqual(provided, secret) ? null : unauthorized(provider);
}

/**
 * Meta's subscription handshake.
 *
 * Before it will send anything, Meta calls this endpoint with GET and expects the
 * `hub.challenge` echoed back verbatim — as plain text, not JSON — but only when
 * `hub.verify_token` matches the token configured in the App dashboard. Comparison is
 * constant-time and an unset token fails closed, exactly as the POST path does.
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "meta") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (!(await withinRateLimit("RATE_LIMIT_WEBHOOKS", clientIp(req)))) {
    return tooManyRequests();
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  const expected = process.env.META_VERIFY_TOKEN;
  if (!expected) {
    monitoring.captureMessage("Meta verification rejected: META_VERIFY_TOKEN not set", {});
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 403 });
  }

  if (mode !== "subscribe" || !timingSafeEqual(token, expected)) {
    monitoring.captureMessage("Meta verification rejected: bad token or mode", { mode: mode ?? "" });
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function unauthorized(provider: string): NextResponse {
  monitoring.captureMessage("Webhook signature rejected", { provider });
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  // Limit before reading the body or verifying the signature: HMAC verification is
  // real work, and an unauthenticated caller should not be able to make us do it
  // repeatedly.
  if (!(await withinRateLimit("RATE_LIMIT_WEBHOOKS", clientIp(req)))) {
    return tooManyRequests();
  }

  // Read once as text: HMAC must be over the exact bytes, and a Request body
  // can only be consumed a single time.
  const rawBody = await req.text();

  const denied = await authorize(provider, req, rawBody);
  if (denied) return denied;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Meta is handled separately and returns early: its webhook carries a receipt, not a
  // lead, so there is nothing for the field mappers below to map. See server/leads/meta.ts.
  if (provider === "meta") {
    const changes = extractLeadgenChanges(body);
    if (changes.length === 0) {
      // A subscription test ping, or a field we do not handle. Acknowledge it —
      // answering with an error would make Meta retry something that will never change.
      return NextResponse.json({ ok: true });
    }
    try {
      const summary = await ingestMetaLeadgen(changes);
      // Nothing about individual leads is returned; see the note at the end of POST.
      return NextResponse.json({ ok: true, received: summary.received });
    } catch (err) {
      if (err instanceof LeadAdsTransientError) {
        // 5xx on purpose: Meta retries for up to 36 hours, which is long enough for an
        // expired token to be replaced without losing a single paid lead.
        monitoring.captureException(err, { where: "webhook.meta" });
        return NextResponse.json({ ok: false, error: "Temporarily unavailable" }, { status: 503 });
      }
      monitoring.captureException(err, { where: "webhook.meta" });
      return NextResponse.json({ ok: false, error: "Failed" }, { status: 500 });
    }
  }

  let mapped: Mapped;
  switch (provider) {
    case "tally":
      mapped = fromTally(body);
      break;
    case "typeform":
      mapped = fromTypeform(body);
      break;
    case "googleads":
      mapped = fromGoogleAds(body);
      break;
    default:
      mapped = fromGeneric(body);
      break;
  }
  mapped.sourceDetail = provider;
  mapped.consentSource = `webhook:${provider}`;

  const result = await createLeadFromIntake(mapped, "webhook");
  if (!result.success) {
    // 4xx is deliberate: Google retries on 5xx, and a malformed payload will
    // never succeed on retry.
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Deliberately does NOT return `deduped` or the lead id. Reporting whether a
  // submission matched an existing record turned this endpoint into a lookup
  // oracle: anyone could test whether a phone number was already a client.
  return NextResponse.json({ ok: true });
}
