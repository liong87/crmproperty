/**
 * Facebook Login, for connecting a Page without leaving the CRM.
 *
 * The shape of the dance, because it is three exchanges and each one is easy to get
 * subtly wrong:
 *
 *   1. Send the user to Facebook with our app id, redirect URI, scopes and a state.
 *   2. Facebook sends them back with a `code`. Exchange it for a SHORT-LIVED USER token.
 *   3. Exchange that for a LONG-LIVED user token (~60 days).
 *   4. Call /me/accounts with the long-lived user token. The PAGE tokens it returns are
 *      then non-expiring, which is the whole reason for step 3 — a page token derived
 *      from a short-lived user token dies in an hour and the agency stops getting leads
 *      one afternoon for no visible reason.
 */
const DEFAULT_VERSION = "v21.0";

/**
 * `pages_show_list` to see the pages, `leads_retrieval` to read submissions,
 * `pages_manage_ads` to read and create the forms themselves. `business_management`
 * is what makes this work for a Page owned by a Business rather than a person, which
 * is how any real agency holds one.
 */
export const META_SCOPES = [
  "pages_show_list",
  "leads_retrieval",
  "pages_manage_ads",
  "business_management",
] as const;

function version(): string {
  return process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
}

/** The App Secret. Reuses the webhook's copy rather than asking for it twice. */
export function metaAppSecret(): string | undefined {
  return process.env.META_APP_SECRET || process.env.WEBHOOK_SECRET_META;
}

export function metaOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && metaAppSecret() && process.env.APP_URL);
}

export function redirectUri(): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/auth/facebook/callback`;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: redirectUri(),
    state,
    scope: META_SCOPES.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${version()}/dialog/oauth?${params.toString()}`;
}

async function graphJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.text();
  if (!res.ok) {
    let msg = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) msg = parsed.error.message;
    } catch {
      /* not JSON */
    }
    throw new Error(`${what} failed: ${msg}`);
  }
  return JSON.parse(body) as T;
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
}

/** Steps 2 to 4. Returns every page the user administers. */
export async function exchangeCodeForPages(code: string): Promise<MetaPage[]> {
  const appId = process.env.META_APP_ID;
  const secret = metaAppSecret();
  if (!appId || !secret) throw new Error("META_APP_ID and the app secret must both be set.");

  const short = await graphJson<{ access_token?: string }>(
    `https://graph.facebook.com/${version()}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: secret,
        redirect_uri: redirectUri(),
        code,
      }).toString(),
    "Exchanging the login code",
  );
  if (!short.access_token) throw new Error("Facebook returned no access token for that login.");

  const long = await graphJson<{ access_token?: string }>(
    `https://graph.facebook.com/${version()}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: secret,
        fb_exchange_token: short.access_token,
      }).toString(),
    "Extending the token",
  );
  // If the extension fails we must NOT quietly carry on with the short-lived token:
  // everything would work today and stop within the hour.
  if (!long.access_token) throw new Error("Facebook would not issue a long-lived token.");

  const pages = await graphJson<{ data?: Array<{ id?: string; name?: string; access_token?: string }> }>(
    `https://graph.facebook.com/${version()}/me/accounts?` +
      new URLSearchParams({ fields: "id,name,access_token", access_token: long.access_token }).toString(),
    "Listing your Pages",
  );

  return (pages.data ?? [])
    .filter((p): p is { id: string; name: string; access_token: string } =>
      Boolean(p?.id && p?.access_token))
    .map((p) => ({ id: p.id, name: p.name ?? "(unnamed page)", accessToken: p.access_token }));
}
