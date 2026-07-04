import { NextResponse } from "next/server";
import { createLeadFromIntake } from "@/server/leads/intake";
import { resolveLandingPage } from "@/lib/public-keys";

export const dynamic = "force-dynamic";

// Public intake — no session. Protected by a per-landing-page API key.
// Middleware allows /api/public/* through unauthenticated.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
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

  // Success: expose only the lead id. Never internal data.
  return NextResponse.json(
    { ok: true, leadId: result.data.leadId, deduped: result.data.deduped },
    { status: 200, headers: CORS },
  );
}
