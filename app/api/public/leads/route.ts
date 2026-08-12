import { NextResponse } from "next/server";
import { createLeadFromIntake } from "@/server/leads/intake";
import { resolveLandingPage } from "@/lib/public-keys";
import { clientIp, withinRateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Public intake — no session. Protected by a per-landing-page API key.
// Middleware allows /api/public/* through unauthenticated.

/**
 * Restrict CORS to our own landing pages instead of "*".
 * PUBLIC_LEAD_ALLOWED_ORIGINS is a comma-separated list, e.g.
 *   "https://www.agency.com.my,https://lp.agency.com.my"
 * With none configured we send no CORS header at all: server-to-server posts
 * (Make, Zapier, Google Ads) are unaffected, only browser JS is blocked.
 */
function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    Vary: "Origin",
  };
  const allowed = (process.env.PUBLIC_LEAD_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin && allowed.includes(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const CORS = corsHeaders(req.headers.get("origin"));

  // Rate limit BEFORE the API key check, so an attacker cannot use this endpoint to
  // brute-force keys, and so invalid traffic costs us nothing but a counter
  // increment. Keyed on IP: the API key is public by design and would be a useless
  // thing to bucket by.
  if (!(await withinRateLimit("RATE_LIMIT_LEADS", clientIp(req)))) {
    return tooManyRequests(CORS);
  }

  // API key from header (x-api-key) or Authorization: Bearer <key>
  const headerKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;

  const landingPage = resolveLandingPage(headerKey);
  if (!landingPage) {
    return NextResponse.json({ ok: false, error: "Invalid API key" }, { status: 401, headers: CORS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS });
  }

  // Attach the landing page as source_detail unless the caller set one.
  const payload = {
    ...(typeof body === "object" && body ? body : {}),
    sourceDetail: (body as Record<string, unknown>)?.sourceDetail ?? landingPage,
    consentSource: (body as Record<string, unknown>)?.consentSource ?? landingPage,
  };

  const result = await createLeadFromIntake(payload, "api");
  if (!result.success) {
    // Return a generic 400 — never leak internal detail beyond the validation message.
    return NextResponse.json({ ok: false, error: result.error }, { status: 400, headers: CORS });
  }

  // Return nothing identifying. `deduped` used to be exposed here, which made
  // this endpoint a lookup oracle: anyone holding a (public, embedded) landing-page
  // key could test whether a phone number already belonged to a client.
  return NextResponse.json({ ok: true }, { status: 200, headers: CORS });
}
