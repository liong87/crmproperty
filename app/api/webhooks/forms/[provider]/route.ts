import { NextResponse } from "next/server";
import { createLeadFromIntake } from "@/server/leads/intake";
import { INTEREST } from "@/lib/constants";
import { hmacBase64, providerSecret, timingSafeEqual } from "@/lib/webhooks/verify";
import { monitoring } from "@/lib/monitoring";
import { clientIp, withinRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Webhook receiver for form and ad-platform lead sources.
 *
 *   POST /api/webhooks/forms/tally
 *   POST /api/webhooks/forms/typeform
 *   POST /api/webhooks/forms/googleads
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

  const provided = req.headers.get("x-webhook-secret") ?? "";
  return timingSafeEqual(provided, secret) ? null : unauthorized(provider);
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
