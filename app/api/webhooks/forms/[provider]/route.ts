import { NextResponse } from "next/server";
import { createLeadFromIntake } from "@/server/leads/intake";
import { INTEREST } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Webhook receiver for no-code form tools (Tally, Typeform, generic).
 * POST /api/webhooks/forms/tally  (or /typeform, /generic)
 *
 * Maps the provider's payload shape to our intake schema, then funnels through
 * the same createLeadFromIntake pipeline (dedup, round-robin, consent, logging).
 *
 * NOTE: signature verification is provider-specific. For the test market we accept
 * posts as-is; before production, verify the provider signature header here
 * (Tally/Typeform sign requests) and reject mismatches.
 */

type Mapped = Record<string, unknown>;
const asInterest = (v: unknown) =>
  typeof v === "string" && (INTEREST as readonly string[]).includes(v.toLowerCase())
    ? v.toLowerCase()
    : null;

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
    consentGiven: Boolean(out["consent"] ?? true),
  };
}

/** Typeform posts `form_response.answers[]` with typed fields. */
function fromTypeform(body: any): Mapped {
  const answers = body?.form_response?.answers ?? [];
  const byType: Record<string, unknown> = {};
  for (const a of answers) {
    if (a.type === "phone_number") byType.phone = a.phone_number;
    else if (a.type === "email") byType.email = a.email;
    else if (a.type === "text" && !byType.name) byType.name = a.text;
    else if (a.type === "choice") byType.interest = a.choice?.label;
  }
  return {
    name: byType.name ?? "",
    phone: byType.phone ?? "",
    email: byType.email ?? null,
    interest: asInterest(byType.interest),
    consentGiven: true,
  };
}

/** Generic: assume the body already uses our field names. */
function fromGeneric(body: any): Mapped {
  return { ...(body ?? {}) };
}

export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let mapped: Mapped;
  switch (provider) {
    case "tally": mapped = fromTally(body); break;
    case "typeform": mapped = fromTypeform(body); break;
    default: mapped = fromGeneric(body); break;
  }
  mapped.sourceDetail = provider;
  mapped.consentSource = `webhook:${provider}`;

  const result = await createLeadFromIntake(mapped, "webhook");
  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, leadId: result.data.leadId, deduped: result.data.deduped });
}
