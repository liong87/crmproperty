import { NextResponse } from "next/server";
import { getCurrentDbUser, isManagerOrAbove } from "@/lib/auth";
import { authorizeUrl, metaOAuthConfigured } from "@/lib/leadads/meta-oauth";

export const dynamic = "force-dynamic";

/** Where a failure sends the user, with something readable attached. */
function back(reason: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/leads-capture?fb_error=${encodeURIComponent(reason)}`, process.env.APP_URL),
  );
}

/**
 * Begin Facebook Login.
 *
 * The `state` is CSRF protection and has to be checked on the way back, or anyone
 * could hand this agency's CRM a Page connection of their choosing by sending a
 * manager a crafted callback link. It goes out in the URL and into an HttpOnly cookie;
 * the callback requires the two to match.
 */
export async function GET() {
  const me = await getCurrentDbUser();
  if (!me || !isManagerOrAbove(me)) {
    return NextResponse.redirect(new URL("/dashboard", process.env.APP_URL));
  }
  if (!metaOAuthConfigured()) {
    return back("Facebook login is not configured. META_APP_ID, the app secret and APP_URL are needed.");
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax", // Must survive the redirect back FROM facebook.com; "strict" would not.
    path: "/api/auth/facebook",
    maxAge: 600, // Ten minutes is longer than any honest login takes.
  });
  return res;
}
