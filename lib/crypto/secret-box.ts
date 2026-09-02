/**
 * Encrypting a credential before it goes in the database.
 *
 * Written against WebCrypto rather than node:crypto because this runs on Cloudflare
 * Workers, where node:crypto is not the same thing it is locally.
 *
 * AES-256-GCM, random 12-byte IV per encryption, stored as base64(iv || ciphertext).
 * GCM is authenticated, so a tampered value fails to decrypt rather than decrypting to
 * something wrong — which matters for a token: a silently corrupted one would look
 * like Facebook revoking access.
 *
 * The key lives in ENCRYPTION_KEY as 32 base64 bytes. Generate one with:
 *
 *   openssl rand -base64 32
 *
 * WHAT THIS DOES AND DOES NOT BUY YOU. It protects a database dump, a Supabase
 * breach, and a backup file left somewhere it should not be — the key is not in any of
 * those. It does NOT protect against someone who can run this code, because they can
 * decrypt too. That is the honest boundary, and it is still worth having: the database
 * is the thing most likely to leak.
 */

const IV_BYTES = 12;

function assertKeyMaterial(raw: string | undefined): string {
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and set it as a Worker secret.",
    );
  }
  return raw;
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importKey(): Promise<CryptoKey> {
  const material = fromBase64(assertKeyMaterial(process.env.ENCRYPTION_KEY).trim());
  if (material.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to 32 bytes; got ${material.length}.`);
  }
  return crypto.subtle.importKey("raw", material as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/** True when a key is configured. Lets a caller degrade gracefully rather than throw. */
export function encryptionAvailable(): boolean {
  return Boolean(process.env.ENCRYPTION_KEY);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return toBase64(packed);
}

export async function decryptSecret(packed: string): Promise<string> {
  const key = await importKey();
  const bytes = fromBase64(packed);
  if (bytes.length <= IV_BYTES) throw new Error("Encrypted value is too short to be valid.");
  const iv = bytes.slice(0, IV_BYTES);
  const cipher = bytes.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
