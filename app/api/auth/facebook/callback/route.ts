import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { connectedPages } from "@/lib/db/schema";
import { getCurrentDbUser, isTeamLeadOrAbove } from "@/lib/auth";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto/secret-box";
import { exchangeCodeForPages, META_SCOPES } from "@/lib/leadads/meta-oauth";
import { monitoring } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

function done(params: Record<string, string>): NextResponse {
  const url = new URL("/leads-capture", process.env.APP_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  // The state cookie has done its job either way; leaving it lying around only widens
  // the window in which it could be replayed.
  res.cookies.delete("fb_oauth_state");
  return res;
}

export async function GET(req: Request) {
  const me = await getCurrentDbUser();
  if (!me || !isTeamLeadOrAbove(me)) {
    return NextResponse.redirect(new URL("/dashboard", process.env.APP_URL));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // Facebook reports a refusal here rather than by not calling back at all.
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (denied) return done({ fb_error: denied });

  const expected = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("fb_oauth_state="))
    ?.slice("fb_oauth_state=".length);

  if (!code || !state || !expected || state !== expected) {
    return done({ fb_error: "That login could not be verified. Start again from Leads capture." });
  }

  /*
   * Checked BEFORE talking to Facebook. Fetching a token we would then have to store
   * in the clear, or throw away, is worse than refusing to start.
   */
  if (!encryptionAvailable()) {
    return done({
      fb_error: "ENCRYPTION_KEY is not set, so a page token cannot be stored safely. Nothing was connected.",
    });
  }

  let pages;
  try {
    pages = await exchangeCodeForPages(code);
  } catch (err) {
    monitoring.captureException(err, { where: "facebook:callback" });
    return done({ fb_error: (err as Error).message });
  }

  if (pages.length === 0) {
    return done({
      fb_error: "That Facebook account administers no Pages, so there is nothing to connect.",
    });
  }

  /*
   * One page, connected. An agency with several would want to choose, but choosing
   * needs a screen that holds the tokens somewhere in the meantime — and a token
   * parked in a session to support a picker is exactly the thing we just went to the
   * trouble of encrypting. The first page is connected and the rest are named in the
   * message, which is honest and needs no holding pen.
   */
  const chosen = pages[0]!;
  const cipher = await encryptSecret(chosen.accessToken);

  // Replace rather than accumulate: reconnecting is how somebody fixes a bad token,
  // and leaving the old row active would mean the fix silently does nothing.
  await db
    .update(connectedPages)
    .set({ active: false, deletedAt: new Date() })
    .where(and(eq(connectedPages.provider, "meta"), isNull(connectedPages.deletedAt)));

  await db.insert(connectedPages).values({
    provider: "meta",
    externalPageId: chosen.id,
    name: chosen.name,
    accessToken: cipher,
    scopes: META_SCOPES.join(","),
    connectedBy: me.id,
    active: true,
  });

  return done({
    fb_connected: chosen.name,
    ...(pages.length > 1
      ? { fb_note: `${pages.length - 1} other Page(s) were not connected: ${pages.slice(1).map((p) => p.name).join(", ")}` }
      : {}),
  });
}
