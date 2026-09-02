import { NextResponse } from "next/server";
import { getCurrentDbUser } from "@/lib/auth";
import { appSecret, captureAuthorizeUrl, captureOAuthConfigured } from "@/lib/capture/meta-graph";
import { STATE_COOKIE, issueState } from "@/lib/capture/oauth-state";
import { encryptionAvailable } from "@/lib/crypto/secret-box";

export const dynamic = "force-dynamic";

/** Where a failure sends the user, with something readable attached. */
function back(reason: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/leads-capture?fb_error=${encodeURIComponent(reason)}`, process.env.APP_URL),
  );
}

/**
 * Begin Facebook Login for the SIGNED-IN AGENT.
 *
 * Every user connects their own Facebook account, so this is deliberately not gated on
 * team_lead any more. An agent running their own ads is the normal case, and gating it
 * would force them to hand their Facebook credentials to somebody else — the exact
 * thing per-user capture exists to stop.
 *
 * The state is signed and carries this user's id; lib/capture/oauth-state.ts explains
 * why a bare nonce stops being sufficient once accounts belong to individuals.
 */
export async function GET() {
  const me = await getCurrentDbUser();
  if (!me) return NextResponse.redirect(new URL("/sign-in", process.env.APP_URL));

  const secret = appSecret();
  if (!captureOAuthConfigured() || !secret) {
    return back("Facebook login is not configured. META_APP_ID, the app secret and APP_URL are needed.");
  }
  /*
   * Refused BEFORE Facebook is contacted. Fetching a token we would then have to store
   * in the clear, or throw away, is worse than never starting.
   */
  if (!encryptionAvailable()) {
    return back("ENCRYPTION_KEY is not set, so a Facebook token cannot be stored safely. Nothing was connected.");
  }

  const { state, nonce } = await issueState(me.id, secret);
  const res = NextResponse.redirect(captureAuthorizeUrl(state));
  res.cookies.set(STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // Must survive the redirect back FROM facebook.com; "strict" would not.
    path: "/api/auth/facebook",
    maxAge: 600, // Ten minutes is longer than any honest login takes.
  });
  return res;
}
