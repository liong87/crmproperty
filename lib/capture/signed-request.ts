/**
 * Facebook's `signed_request`, the format its account callbacks use.
 *
 * `base64url(HMAC-SHA256(payload, appSecret)).base64url(payloadJson)` — signature
 * first, payload second, joined by a dot. Not a JWT, despite looking like one: the
 * algorithm lives INSIDE the payload rather than in a header.
 *
 * The signature is the only authentication these endpoints have. They carry no session
 * and anyone on the internet can POST to them, so an unverified payload would let a
 * stranger disconnect any agent's Facebook, or trigger a data deletion, by guessing a
 * user id. Verify first, always.
 */

export interface SignedRequestPayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
}

function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify and decode. Returns null on ANY failure — malformed, bad signature, wrong
 * algorithm — because every one of them means the same thing to a caller: do not act
 * on this. Distinguishing them would only tell a prober how close they got.
 */
export async function parseSignedRequest(
  signed: string,
  appSecret: string,
): Promise<SignedRequestPayload | null> {
  const dot = signed.indexOf(".");
  if (dot <= 0) return null;

  const sigPart = signed.slice(0, dot);
  const payloadPart = signed.slice(dot + 1);

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret) as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromB64url(sigPart) as BufferSource,
      new TextEncoder().encode(payloadPart) as BufferSource,
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromB64url(payloadPart))) as SignedRequestPayload;
    /*
     * Checked explicitly. The algorithm is named inside the signed payload, so a
     * caller that trusts it blindly could be handed one naming something we did not
     * verify with — the classic "alg: none" shape of bug, in Facebook's clothing.
     */
    if (payload.algorithm && payload.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
    return payload;
  } catch {
    return null;
  }
}
