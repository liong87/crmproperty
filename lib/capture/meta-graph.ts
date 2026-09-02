/**
 * Graph API calls for per-user lead capture.
 *
 * Every function here runs SERVER SIDE ONLY, in the Worker. No token in this file ever
 * reaches the browser — not in a response body, not truncated, not in an error
 * message. The error strings are deliberately written to be safe to show a user.
 *
 * Sibling to lib/leadads/meta-oauth.ts, which is the older agency-wide flow. That one
 * connects one Page for everybody; this one connects a Page for one person. They share
 * the app credentials and nothing else.
 */

const DEFAULT_VERSION = "v21.0";

/**
 * The scopes Brief 5 §1 asks Meta to review.
 *
 *   leads_retrieval        read the submitted lead — the entire point
 *   pages_show_list        list the Pages the person administers, for the picker
 *   pages_read_engagement  read Page metadata (name) without ads permissions
 *   pages_manage_metadata  subscribe the app to the Page's leadgen webhook
 *   pages_manage_ads       LIST the Page's lead forms, and create one
 *   ads_management         read the ad behind a lead, for attribution
 *
 * `pages_manage_ads` is not optional and is easy to leave out, because nothing about
 * the name suggests "read the forms on this page". Without it `/{page-id}/leadgen_forms`
 * answers `(#200) Requires pages_manage_ads permission to manage the object` — the
 * connection succeeds, the page subscribes, and only the form picker fails. It was
 * missing from the first cut of this list for exactly that reason.
 *
 * `leads_retrieval`, `pages_manage_ads` and `ads_management` require App Review and
 * Business Verification. Until that is granted, only people added to the app as
 * Testers/Developers get them — which is exactly the interim plan.
 */
export const CAPTURE_SCOPES = [
  "leads_retrieval",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_manage_ads",
  "ads_management",
  // Needed to enumerate the Business Portfolios a person belongs to, which is the only
  // way to reach a Page the BUSINESS owns rather than the person. See fetchPages.
  "business_management",
] as const;

function version(): string {
  return process.env.META_GRAPH_VERSION || DEFAULT_VERSION;
}

export function appSecret(): string | undefined {
  return process.env.META_APP_SECRET || process.env.WEBHOOK_SECRET_META;
}

export function captureOAuthConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && appSecret() && process.env.APP_URL);
}

export function captureRedirectUri(): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/auth/facebook/callback`;
}

/**
 * The Login-for-Business configuration id, if one exists.
 *
 * THIS IS THE DIFFERENCE BETWEEN WORKING AND NOT WORKING, and it took a live failure to
 * find. Facebook Login for Business does not grant Pages through the plain OAuth
 * dialog: permissions are granted, a token comes back, and `/me/accounts` is EMPTY —
 * because the step where the person chooses which Pages to share only runs when the
 * dialog is opened against a configuration. A Page owned by a Business Portfolio, which
 * is how any real agency holds one, can never be reached without this.
 *
 * The failure has no error attached to it. The login succeeds and the CRM concludes the
 * person administers no Pages, which is a lie it cannot detect.
 */
export function loginConfigId(): string | undefined {
  return process.env.META_LOGIN_CONFIG_ID || undefined;
}

export function captureAuthorizeUrl(state: string): string {
  const configId = loginConfigId();

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? "",
    redirect_uri: captureRedirectUri(),
    state,
    response_type: "code",
  });

  if (configId) {
    /*
     * With a configuration, the permissions come FROM the configuration — sending
     * `scope` as well is not merged, it is ignored, so the config is the only place the
     * scope list is real. `override_default_response_type` is required for the code
     * flow; without it Facebook returns a token in the URL fragment, which never
     * reaches the server and looks like a silent failure.
     */
    params.set("config_id", configId);
    params.set("override_default_response_type", "true");
  } else {
    // Fallback: the consumer dialog. Grants user permissions and personal Pages only.
    params.set("scope", CAPTURE_SCOPES.join(","));
    params.set("auth_type", "rerequest");
  }

  return `https://www.facebook.com/${version()}/dialog/oauth?${params.toString()}`;
}

async function graph<T>(url: string, what: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { accept: "application/json", ...init?.headers } });
  const body = await res.text();
  if (!res.ok) {
    let msg = body.slice(0, 200);
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

export interface LongLivedToken {
  token: string;
  /** Meta returns seconds; null means "no stated expiry". */
  expiresAt: Date | null;
}

/**
 * Login code → long-lived (~60 day) USER token.
 *
 * The extension in step two is not optional. A Page token derived from a short-lived
 * user token dies within the hour, and the failure mode is the worst kind: everything
 * works while you are testing it and leads stop arriving that afternoon.
 */
export async function exchangeCodeForUserToken(code: string): Promise<LongLivedToken> {
  const appId = process.env.META_APP_ID;
  const secret = appSecret();
  if (!appId || !secret) throw new Error("META_APP_ID and the app secret must both be set.");

  const short = await graph<{ access_token?: string }>(
    `https://graph.facebook.com/${version()}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: secret,
        redirect_uri: captureRedirectUri(),
        code,
      }).toString(),
    "Exchanging the login code",
  );
  if (!short.access_token) throw new Error("Facebook returned no access token for that login.");

  const long = await graph<{ access_token?: string; expires_in?: number }>(
    `https://graph.facebook.com/${version()}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: secret,
        fb_exchange_token: short.access_token,
      }).toString(),
    "Extending the token",
  );
  if (!long.access_token) throw new Error("Facebook would not issue a long-lived token.");

  return {
    token: long.access_token,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null,
  };
}

export interface MetaIdentity {
  id: string;
  name: string;
}

/** Who just logged in. Stored so a reconnect updates the row instead of duplicating it. */
export async function fetchIdentity(userToken: string): Promise<MetaIdentity> {
  const me = await graph<{ id?: string; name?: string }>(
    `https://graph.facebook.com/${version()}/me?` +
      new URLSearchParams({ fields: "id,name", access_token: userToken }).toString(),
    "Reading your Facebook profile",
  );
  if (!me.id) throw new Error("Facebook did not identify the account that logged in.");
  return { id: me.id, name: me.name ?? "Facebook account" };
}

export interface MetaPageGrant {
  id: string;
  name: string;
  accessToken: string;
}

interface RawPage {
  id?: string;
  name?: string;
  access_token?: string;
}

const usable = (rows: RawPage[]): MetaPageGrant[] =>
  rows
    .filter((p): p is { id: string; name?: string; access_token: string } =>
      Boolean(p?.id && p?.access_token))
    .map((p) => ({ id: p.id, name: p.name ?? "(unnamed Page)", accessToken: p.access_token }));

/**
 * Every Page this person can hand us, each with its own token.
 *
 * TWO SOURCES, AND THE SECOND IS NOT OPTIONAL. `/me/accounts` lists Pages the PERSON
 * holds a role on. A Page owned by a Business Portfolio is not one of those, so it
 * comes back empty — even when the person has just ticked that exact Page on
 * Facebook's own "Choose the Pages you want ... to access" screen. The grant is real;
 * the endpoint simply does not report it.
 *
 * That combination is vicious to debug: consent succeeded, every permission is
 * granted, the Page was explicitly selected, and the API answers with an empty array
 * and no error. Any agency Page worth connecting is business-owned, so this fallback
 * is the normal path rather than an edge case.
 */
export async function fetchPages(userToken: string): Promise<MetaPageGrant[]> {
  const direct = await graph<{ data?: RawPage[] }>(
    `https://graph.facebook.com/${version()}/me/accounts?` +
      new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: userToken }).toString(),
    "Listing your Pages",
  );
  const personal = usable(direct.data ?? []);
  if (personal.length > 0) return personal;

  // Business-owned. Failures here are swallowed per business: one portfolio we cannot
  // read must not hide the Pages of another that we can.
  let businesses: Array<{ id?: string }> = [];
  try {
    const res = await graph<{ data?: Array<{ id?: string }> }>(
      `https://graph.facebook.com/${version()}/me/businesses?` +
        new URLSearchParams({ fields: "id,name", limit: "50", access_token: userToken }).toString(),
      "Listing your businesses",
    );
    businesses = res.data ?? [];
  } catch {
    return [];
  }

  const found = new Map<string, MetaPageGrant>();
  for (const business of businesses) {
    if (!business.id) continue;
    // owned_pages: the business holds the Page. client_pages: another business owns it
    // and shares it with this one — an agency running a developer's Page is exactly that.
    for (const edge of ["owned_pages", "client_pages"] as const) {
      try {
        const res = await graph<{ data?: RawPage[] }>(
          `https://graph.facebook.com/${version()}/${business.id}/${edge}?` +
            new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: userToken }).toString(),
          `Listing ${edge.replace("_", " ")}`,
        );
        for (const page of usable(res.data ?? [])) found.set(page.id, page);
      } catch {
        /* This business, this edge, no access. Keep going. */
      }
    }
  }
  return [...found.values()];
}

/**
 * Subscribe our app to a Page's leadgen webhook.
 *
 * Called with the PAGE token, not the user token — the Page is the thing granting, and
 * a user token here fails with a confusing permissions error. The caller must only
 * record `subscribed = true` when this resolves, because an unsubscribed Page produces
 * no webhook at all and the CRM would show a connection that silently receives nothing.
 */
export async function subscribePageToLeadgen(pageId: string, pageToken: string): Promise<void> {
  const body = new URLSearchParams({
    subscribed_fields: "leadgen",
    access_token: pageToken,
  });
  const out = await graph<{ success?: boolean }>(
    `https://graph.facebook.com/${version()}/${encodeURIComponent(pageId)}/subscribed_apps`,
    "Subscribing to that Page's leads",
    { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } },
  );
  if (out.success !== true) {
    throw new Error("Facebook did not confirm the lead subscription for that Page.");
  }
}

/** Remove our app's subscription. Used when a page is unpicked or disconnected. */
export async function unsubscribePage(pageId: string, pageToken: string): Promise<void> {
  await graph<unknown>(
    `https://graph.facebook.com/${version()}/${encodeURIComponent(pageId)}/subscribed_apps?` +
      new URLSearchParams({ access_token: pageToken }).toString(),
    "Removing that Page's lead subscription",
    { method: "DELETE" },
  );
}

/**
 * Which permissions Facebook actually granted.
 *
 * Diagnostic, and it earns its place: "no Pages came back" has at least four causes
 * that look identical from here — the configuration is missing the Pages asset, it is
 * missing `pages_show_list`, the person skipped the Page-selection screen, or they
 * genuinely administer none. Guessing between them costs a deploy each time. The
 * granted list separates the first two from the last two immediately.
 */
export async function fetchGrantedScopes(userToken: string): Promise<string[]> {
  try {
    const res = await graph<{ data?: Array<{ permission?: string; status?: string }> }>(
      `https://graph.facebook.com/${version()}/me/permissions?` +
        new URLSearchParams({ access_token: userToken }).toString(),
      "Reading granted permissions",
    );
    return (res.data ?? [])
      .filter((p) => p.status === "granted" && p.permission)
      .map((p) => p.permission!);
  } catch {
    // Never let a diagnostic call turn into the error the user sees.
    return [];
  }
}

export interface MetaAdAccount {
  /** Meta's id, already prefixed: "act_1234567890". */
  id: string;
  name: string;
  /** ACTIVE | DISABLED | UNSETTLED … as Meta's numeric status, mapped. */
  status: string;
  currency: string | null;
}

const AD_ACCOUNT_STATUS: Record<number, string> = {
  1: "active",
  2: "disabled",
  3: "unsettled",
  7: "pending review",
  9: "in grace period",
  101: "closed",
};

/**
 * The ad accounts this person can read.
 *
 * Uses the SAME user token as page capture, because `ads_management` is already in the
 * login configuration — so connecting an ad account costs the agent no extra consent
 * screen, it is simply a second thing that login already permitted.
 *
 * Note `/me/adaccounts` returns accounts the person has any role on, including ones
 * they can see but not spend from. The status is carried through rather than filtered
 * so a disabled account is visible and explained, instead of silently missing from a
 * list the agent expects to find it in.
 */
export async function fetchAdAccounts(userToken: string): Promise<MetaAdAccount[]> {
  const res = await graph<{
    data?: Array<{ id?: string; name?: string; account_status?: number; currency?: string }>;
  }>(
    `https://graph.facebook.com/${version()}/me/adaccounts?` +
      new URLSearchParams({
        fields: "id,name,account_status,currency",
        limit: "100",
        access_token: userToken,
      }).toString(),
    "Listing your ad accounts",
  );
  return (res.data ?? [])
    .filter((a): a is { id: string; name?: string; account_status?: number; currency?: string } =>
      Boolean(a?.id))
    .map((a) => ({
      id: a.id,
      name: a.name ?? a.id,
      status: AD_ACCOUNT_STATUS[a.account_status ?? -1] ?? "unknown",
      currency: a.currency ?? null,
    }));
}
