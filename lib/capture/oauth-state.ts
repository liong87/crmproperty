/**
 * The `state` parameter for Facebook Login, signed and single-use.
 *
 * A random uuid in a cookie is enough CSRF protection when there is one agency-wide
 * connection. It is NOT enough once connections belong to individual people, because
 * the thing we now have to prevent is subtler than cross-site forgery: agent A must
 * not be able to cause agent B's callback to attach A's Facebook account — or, worse,
 * to attach B's Facebook account to A's CRM user. So the state carries the user id it
 * was issued to, signed, and the callback refuses to proceed unless the signed id
 * matches whoever is actually signed in when the redirect lands.
 *
 * Three defences, all needed:
 *   - HMAC signature      → the payload cannot be edited (no swapping the user id)
 *   - `exp`               → a stolen link is useless after ten minutes
 *   - nonce + cookie      → single use, and the browser that started it must finish it
 *
 * The cookie is what makes it single-use: the callback deletes it, so a replay of the
 * exact same URL finds no cookie to match against.
 */

const TTL_MS = 10 * 60 * 1000;

/** Name of the HttpOnly cookie holding the nonce. Shared by both OAuth routes. */
export const STATE_COOKIE = "fb_oauth_nonce";

interface StatePayload {
  /** CRM user id the login was started by. */
  u: string;
  /** Random nonce, mirrored in the HttpOnly cookie. */
  n: string;
  /** Expiry, epoch ms. */
  e: number;
  /** Where to return to. Signed, so it cannot be turned into an open redirect. */
  r?: string;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface IssuedState {
  /** Goes in the authorize URL. */
  state: string;
  /** Goes in the HttpOnly cookie. */
  nonce: string;
}

export async function issueState(
  userId: string,
  secret: string,
  returnTo?: string,
): Promise<IssuedState> {
  const nonce = crypto.randomUUID();
  const payload: StatePayload = {
    u: userId,
    n: nonce,
    e: Date.now() + TTL_MS,
    ...(returnTo ? { r: returnTo } : {}),
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await signingKey(secret), new TextEncoder().encode(body) as BufferSource);
  return { state: `${body}.${b64url(new Uint8Array(sig))}`, nonce };
}

/**
 * Verify a returned state.
 *
 * Returns the user id it was issued to, or null. Null is the only failure signal on
 * purpose — a caller that could tell "expired" from "bad signature" would leak whether
 * a forged state was well-formed, and there is nothing useful either way: every
 * failure means "start again".
 */
export interface VerifiedState {
  userId: string;
  /** Always a same-origin path; see safeReturnPath. */
  returnTo: string;
}

/**
 * Only a path on this site, never a URL.
 *
 * A return address that survives a round trip through a third party is an open-redirect
 * waiting to happen: "//evil.example" and "https://evil.example" are both valid values
 * of `next` that a browser would follow off-site. Signing the state stops an attacker
 * FORGING one, but the value still has to be constrained, because the person who chose
 * it is not necessarily the person who lands on it.
 */
export function safeReturnPath(raw: string | null | undefined, fallback = "/leads-capture"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export async function verifyState(
  state: string | null,
  cookieNonce: string | undefined,
  secret: string,
): Promise<VerifiedState | null> {
  if (!state || !cookieNonce) return null;
  const dot = state.indexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      fromB64url(sig) as BufferSource,
      new TextEncoder().encode(body) as BufferSource,
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as StatePayload;
  } catch {
    return null;
  }
  if (!payload?.u || !payload?.n || typeof payload.e !== "number") return null;
  if (Date.now() > payload.e) return null;
  // The browser that finishes must be the browser that started.
  if (payload.n !== cookieNonce) return null;
  return { userId: payload.u, returnTo: safeReturnPath(payload.r) };
}
