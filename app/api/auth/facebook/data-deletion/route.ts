import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { captureAccounts, capturePages } from "@/lib/db/schema";
import { parseSignedRequest } from "@/lib/capture/signed-request";
import { appSecret } from "@/lib/capture/meta-graph";
import { monitoring } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

/**
 * Facebook's data-deletion callback. Required to submit App Review.
 *
 * Meta calls this when someone asks Facebook to delete the data an app holds about
 * them, and expects a JSON body with a `url` a human can visit to check on the request,
 * plus a `confirmation_code`.
 *
 * WHAT THIS DELETES, precisely: the person's Facebook CONNECTION — the account row, its
 * pages, and the encrypted tokens. It does NOT delete leads. Those are the agency's own
 * business records about third parties who filled in a form, held under Malaysian PDPA
 * with their own retention rules; deleting an agent's Facebook link is not consent to
 * erase a buyer's enquiry. PDPA erasure is a separate, deliberate flow.
 *
 * Like the deauthorize callback, the signature is the only authentication.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = appSecret();
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");

  let providerUserId: string | null = null;
  if (secret) {
    try {
      const form = await req.formData();
      const signed = form.get("signed_request");
      if (typeof signed === "string") {
        const payload = await parseSignedRequest(signed, secret);
        providerUserId = payload?.user_id ?? null;
      }
    } catch (err) {
      monitoring.captureException(err, { where: "facebook:data-deletion:parse" });
    }
  }

  // The code is what the person quotes when asking what happened. It has to identify
  // the request without being guessable, and without leaking their Facebook id.
  const confirmationCode = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  if (providerUserId) {
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
        /*
         * The token is overwritten, not merely soft-deleted. A soft-deleted row still
         * holds working ciphertext, and "delete my data" answered by hiding a row that
         * still contains a usable credential is not an honest answer.
         */
        await db
          .update(captureAccounts)
          .set({
            accessToken: "",
            status: "deleted",
            deletedAt: now,
            updatedAt: now,
          })
          .where(eq(captureAccounts.id, account.id));
      }
      monitoring.captureMessage("Facebook data deletion completed", { confirmationCode });
    } catch (err) {
      monitoring.captureException(err, { where: "facebook:data-deletion" });
    }
  }

  return NextResponse.json({
    url: `${base}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
