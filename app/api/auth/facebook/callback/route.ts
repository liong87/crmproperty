import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { captureAccounts, capturePages } from "@/lib/db/schema";
import { getCurrentDbUser } from "@/lib/auth";
import { encryptSecret, encryptionAvailable } from "@/lib/crypto/secret-box";
import {
  CAPTURE_SCOPES,
  appSecret,
  exchangeCodeForUserToken,
  fetchIdentity,
  fetchPages,
  fetchGrantedScopes,
  loginConfigId,
} from "@/lib/capture/meta-graph";
import { STATE_COOKIE, verifyState } from "@/lib/capture/oauth-state";
import { monitoring } from "@/lib/monitoring";

export const dynamic = "force-dynamic";

function done(params: Record<string, string>): NextResponse {
  const url = new URL("/leads-capture", process.env.APP_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  // Single use. Deleting the cookie here is what stops this exact URL being replayed.
  res.cookies.delete(STATE_COOKIE);
  return res;
}

function readCookie(req: Request, name: string): string | undefined {
  return req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Facebook comes back here.
 *
 * The connection is written for the person who started it and nobody else. Note the
 * double check: the state is signed with a user id AND the session is read again here,
 * and the two must agree. Either alone is insufficient — a signed state alone would
 * let a login started in one browser be completed in another's session, and a session
 * check alone would let a crafted link attach an attacker's Facebook account to
 * whoever happened to click it.
 *
 * Pages are stored but NOT subscribed. Choosing which Pages feed the CRM is an
 * explicit step on the next screen, because subscribing to everything somebody happens
 * to administer is how a personal Page starts dumping leads into a work CRM.
 */
export async function GET(req: Request) {
  const me = await getCurrentDbUser();
  if (!me) return NextResponse.redirect(new URL("/sign-in", process.env.APP_URL));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  // Facebook reports a refusal here rather than by not calling back at all.
  const denied = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (denied) return done({ fb_error: denied });

  const secret = appSecret();
  if (!secret) return done({ fb_error: "Facebook login is not configured." });

  const issuedTo = await verifyState(url.searchParams.get("state"), readCookie(req, STATE_COOKIE), secret);
  if (!code || !issuedTo || issuedTo !== me.id) {
    return done({ fb_error: "That login could not be verified. Start again from Leads capture." });
  }

  if (!encryptionAvailable()) {
    return done({
      fb_error: "ENCRYPTION_KEY is not set, so a Facebook token cannot be stored safely. Nothing was connected.",
    });
  }

  let identity: Awaited<ReturnType<typeof fetchIdentity>>;
  let pages: Awaited<ReturnType<typeof fetchPages>>;
  let userToken: Awaited<ReturnType<typeof exchangeCodeForUserToken>>;
  try {
    userToken = await exchangeCodeForUserToken(code);
    identity = await fetchIdentity(userToken.token);
    pages = await fetchPages(userToken.token);
  } catch (err) {
    // Never the token, never the code — a monitoring backend is not a secret store.
    monitoring.captureException(err, { where: "capture:facebook:callback", userId: me.id });
    return done({ fb_error: (err as Error).message });
  }

  /*
   * Zero pages does NOT reliably mean the person administers none. Facebook Login for
   * Business asks separately which Pages to share, and that step is skipped whenever
   * Facebook decides the app was already granted — so a re-connect can come back
   * authorised, with an empty page list, and the old message ("administers no Pages")
   * then blames the user for something they cannot see. The message has to name the
   * actual recovery, which is removing the app so the picker is shown again.
   */
  if (pages.length === 0) {
    const granted = await fetchGrantedScopes(userToken.token);
    const missing = CAPTURE_SCOPES.filter((need) => !granted.includes(need));

    if (!loginConfigId()) {
      return done({
        fb_error:
          "Facebook shared no Pages, and the Meta app has no Login-for-Business configuration set (META_LOGIN_CONFIG_ID). Without one Facebook never asks which Pages to share.",
      });
    }
    if (missing.length > 0) {
      /*
       * The decisive case, and the one worth naming precisely: with a configuration,
       * permissions come from the CONFIGURATION, not from this code. A scope missing
       * here means it was never ticked when the configuration was created — and
       * `pages_show_list` missing makes /me/accounts return an empty list with no
       * error at all, which is indistinguishable from owning no Pages.
       */
      return done({
        fb_error: `Facebook granted ${granted.length} permission(s) but not: ${missing.join(", ")}. These come from the Login-for-Business configuration, so open it in the Meta console, tick the missing ones, save, and click Add again.`,
      });
    }
    return done({
      fb_error:
        "Every permission was granted but Facebook shared no Pages. The configuration is probably missing the Pages asset: open it in the Meta console, add Pages under Assets, save, then click Add again and tick your Page on the 'Which Pages?' screen.",
    });
  }

  const cipherUserToken = await encryptSecret(userToken.token);
  const now = new Date();

  /*
   * A reconnect updates in place. The alternative — inserting a second row — would
   * leave the old expired token active with the page subscriptions still pointing at
   * it, so fixing a broken connection would appear to do nothing. The partial unique
   * index on (provider, provider_user_id, owner_user_id) enforces this in the database
   * as well, so a race loses rather than duplicating.
   */
  const [existing] = await db
    .select({ id: captureAccounts.id })
    .from(captureAccounts)
    .where(
      and(
        eq(captureAccounts.provider, "facebook"),
        eq(captureAccounts.providerUserId, identity.id),
        eq(captureAccounts.ownerUserId, me.id),
        isNull(captureAccounts.deletedAt),
      ),
    )
    .limit(1);

  let accountId: string;
  if (existing) {
    accountId = existing.id;
    await db
      .update(captureAccounts)
      .set({
        displayName: identity.name,
        accessToken: cipherUserToken,
        tokenExpiresAt: userToken.expiresAt,
        scopes: CAPTURE_SCOPES.join(","),
        status: "active",
        lastCheckedAt: now,
        updatedAt: now,
      })
      .where(eq(captureAccounts.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(captureAccounts)
      .values({
        provider: "facebook",
        ownerUserId: me.id,
        providerUserId: identity.id,
        displayName: identity.name,
        accessToken: cipherUserToken,
        tokenExpiresAt: userToken.expiresAt,
        scopes: CAPTURE_SCOPES.join(","),
        status: "active",
        lastCheckedAt: now,
      })
      .returning({ id: captureAccounts.id });
    if (!inserted) return done({ fb_error: "The connection could not be saved. Please try again." });
    accountId = inserted.id;
  }

  /*
   * Page rows are the holding pen the picker reads from, and they are safe to be one
   * because the token in them is already ciphertext. The previous flow refused to build
   * a picker for exactly this reason and connected the first Page instead — which was
   * wrong the moment anybody administered two.
   */
  const known = await db
    .select({ id: capturePages.id, externalPageId: capturePages.externalPageId })
    .from(capturePages)
    .where(and(eq(capturePages.accountId, accountId), isNull(capturePages.deletedAt)));
  const byExternal = new Map(known.map((p) => [p.externalPageId, p.id]));

  for (const page of pages) {
    const cipher = await encryptSecret(page.accessToken);
    const existingId = byExternal.get(page.id);
    if (existingId) {
      // Refresh name and token; leave `subscribed` alone. A reconnect must not silently
      // re-subscribe a Page the user previously chose to unpick.
      await db
        .update(capturePages)
        .set({ name: page.name, accessToken: cipher, updatedAt: now })
        .where(eq(capturePages.id, existingId));
    } else {
      await db.insert(capturePages).values({
        accountId,
        externalPageId: page.id,
        name: page.name,
        accessToken: cipher,
        subscribed: false,
      });
    }
  }

  return done({ fb_connected: identity.name, fb_pick: accountId });
}
