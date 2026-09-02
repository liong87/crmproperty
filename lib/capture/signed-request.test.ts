import { describe, expect, it } from "vitest";
import { parseSignedRequest } from "./signed-request";

const SECRET = "app-secret";

const b64url = (b: Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : Buffer.from(b)).toString("base64url");

async function sign(payload: unknown, secret = SECRET): Promise<string> {
  const body = b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${b64url(new Uint8Array(sig))}.${body}`;
}

describe("Facebook signed_request", () => {
  it("accepts a correctly signed payload", async () => {
    const signed = await sign({ user_id: "12345", algorithm: "HMAC-SHA256" });
    expect(await parseSignedRequest(signed, SECRET)).toMatchObject({ user_id: "12345" });
  });

  it("rejects a payload signed with a different secret", async () => {
    // The attack: anyone can POST here, so an unverified body would let a stranger
    // disconnect any agent's Facebook by guessing a user id.
    const signed = await sign({ user_id: "12345" }, "not-our-secret");
    expect(await parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects a payload edited after signing", async () => {
    const signed = await sign({ user_id: "12345", algorithm: "HMAC-SHA256" });
    const [sig] = signed.split(".");
    const forged = `${sig}.${b64url(JSON.stringify({ user_id: "99999", algorithm: "HMAC-SHA256" }))}`;
    expect(await parseSignedRequest(forged, SECRET)).toBeNull();
  });

  it("rejects an algorithm we did not verify with", async () => {
    // The payload NAMES its own algorithm, so trusting that field is the "alg: none"
    // bug in Facebook's clothing.
    const signed = await sign({ user_id: "12345", algorithm: "none" });
    expect(await parseSignedRequest(signed, SECRET)).toBeNull();
  });

  it("rejects malformed input rather than throwing", async () => {
    expect(await parseSignedRequest("", SECRET)).toBeNull();
    expect(await parseSignedRequest("nodot", SECRET)).toBeNull();
    expect(await parseSignedRequest(".", SECRET)).toBeNull();
    expect(await parseSignedRequest("a.b", SECRET)).toBeNull();
  });
});
