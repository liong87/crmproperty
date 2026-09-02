import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { captureAccounts, capturePages } from "@/lib/db/schema";
import { parseSignedRequest } from "@/lib/capture/signed-request";
import { appSecret } from "@/lib/capture/meta-graph";
import { monitoring } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/**
 * Facebook calls this when somebody removes the app from their account.
 *
 * Required for App Review, and useful on its own: without it the CRM keeps showing a
 * connection that Facebook has already severed, so the agent sees "1 page connected"
 * while no lead has arrived for a week and nothing explains why.
 *
 * The body is a SIGNED REQUEST, not JSON, and the signature is the only authentication
 * there is — this endpoint has no session and anyone can POST to it. An unverified body
 * here would let a stranger disconnect any agent's Facebook by guessing a user id.
 *
 * Rows are soft-deleted rather than removed: `capture_events` reference them, and the
 * history of which leads came through which connection is worth keeping.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = appSecret();
  if (!secret) return NextResponse.json({ ok: true });

  let providerUserId: string | null = null;
  try {
    const form = await req.formData();
    const signed = form.get("signed_request");
    if (typeof signed === "string") {
      const payload = await parseSignedRequest(signed, secret);
      providerUserId = payload?.user_id ?? null;
    }
  } catch (err) {
    monitoring.captureException(err, { where: "facebook:deauthorize:parse" });
  }

  // Answer 200 either way. Facebook retries on failure and there is nothing to retry:
  // an unverifiable callback will not become verifiable.
  if (!providerUserId) return NextResponse.json({ ok: true });

  try {
    const now = new Date();
    const accounts = await db
      .select({ id: captureAccounts.id })
      .from(captureAccounts)
      .where(
        and(
          eq(captureAccounts.provider, "facebook"),
          eq(captureAccounts.providerUserId, providerUserId),
          isNull(captureAccounts.deletedAt),
        ),
      );

    for (const account of accounts) {
      await db
        .update(capturePages)
        .set({ subscribed: false, deletedAt: now, updatedAt: now })
        .where(and(eq(capturePages.accountId, account.id), isNull(capturePages.deletedAt)));
      await db
        .update(captureAccounts)
        .set({ status: "revoked", deletedAt: now, updatedAt: now })
        .where(eq(captureAccounts.id, account.id));
    }
  } catch (err) {
    monitoring.captureException(err, { where: "facebook:deauthorize" });
  }

  return NextResponse.json({ ok: true });
}
