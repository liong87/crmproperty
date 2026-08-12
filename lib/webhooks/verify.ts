/**
 * Webhook authenticity checks.
 *
 * Every inbound webhook MUST be verified. Until this existed the form webhook was
 * an open endpoint: anyone could create leads, notify agents, and — worse — write a
 * PDPA consent record for a person who never consented.
 *
 * Uses Web Crypto only (no node:crypto), so this runs unchanged on Node and on
 * Cloudflare Workers.
 */

export class WebhookAuthError extends Error {
  constructor(message = "WEBHOOK_UNAUTHORIZED") {
    super(message);
    this.name = "WebhookAuthError";
  }
}

/** Constant-time comparison. Never use === on secrets: length and early-exit leak. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  // Compare a fixed number of bytes so the duration does not reveal the length.
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256(secret: string, payload: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** HMAC-SHA256 of the raw body, base64-encoded (Tally, Typeform). */
export async function hmacBase64(secret: string, rawBody: string): Promise<string> {
  return toBase64(await hmacSha256(secret, rawBody));
}

/** HMAC-SHA256 of the raw body, hex-encoded (used by several other providers). */
export async function hmacHex(secret: string, rawBody: string): Promise<string> {
  return toHex(await hmacSha256(secret, rawBody));
}

/**
 * Read a provider's configured secret.
 *
 * Env var naming: WEBHOOK_SECRET_<PROVIDER>, e.g. WEBHOOK_SECRET_TALLY.
 * Returns null when unset — callers MUST then reject the request. Failing closed
 * is deliberate: an unconfigured provider is an open door, not a convenience.
 */
export function providerSecret(provider: string): string | null {
  const key = `WEBHOOK_SECRET_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  const value = process.env[key];
  return value && value.length > 0 ? value : null;
}
