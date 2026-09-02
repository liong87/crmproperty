import { describe, expect, it } from "vitest";
import { issueState, verifyState } from "./oauth-state";

const SECRET = "test-app-secret";
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("capture OAuth state", () => {
  it("round-trips the user it was issued to", async () => {
    const { state, nonce } = await issueState(USER, SECRET);
    expect(await verifyState(state, nonce, SECRET)).toBe(USER);
  });

  it("rejects a state whose payload was edited", async () => {
    // The attack this exists to stop: swap the user id so somebody else's callback
    // attaches your Facebook account, or yours attaches theirs.
    const { state, nonce } = await issueState(USER, SECRET);
    const [body, sig] = state.split(".");
    const forged =
      Buffer.from(JSON.stringify({ u: OTHER, n: nonce, e: Date.now() + 60_000 }))
        .toString("base64url") + "." + sig;
    expect(forged).not.toBe(state);
    expect(body).toBeTruthy();
    expect(await verifyState(forged, nonce, SECRET)).toBeNull();
  });

  it("rejects a signature made with a different secret", async () => {
    const { state, nonce } = await issueState(USER, "some-other-secret");
    expect(await verifyState(state, nonce, SECRET)).toBeNull();
  });

  it("rejects when the cookie nonce does not match", async () => {
    // Same browser requirement: a state lifted out of one person's URL is useless
    // without the HttpOnly cookie that went with it.
    const { state } = await issueState(USER, SECRET);
    const other = await issueState(USER, SECRET);
    expect(await verifyState(state, other.nonce, SECRET)).toBeNull();
  });

  it("rejects a missing state or missing cookie", async () => {
    const { state, nonce } = await issueState(USER, SECRET);
    expect(await verifyState(null, nonce, SECRET)).toBeNull();
    expect(await verifyState(state, undefined, SECRET)).toBeNull();
  });

  it("rejects an expired state", async () => {
    const { nonce } = await issueState(USER, SECRET);
    // Hand-build one that is already past its expiry, signed correctly — expiry must
    // be enforced on its own, not implied by the signature being fresh.
    const body = Buffer.from(
      JSON.stringify({ u: USER, n: nonce, e: Date.now() - 1000 }),
    ).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const state = `${body}.${Buffer.from(new Uint8Array(sig)).toString("base64url")}`;
    expect(await verifyState(state, nonce, SECRET)).toBeNull();
  });

  it("rejects malformed input rather than throwing", async () => {
    expect(await verifyState("not-a-state", "n", SECRET)).toBeNull();
    expect(await verifyState(".", "n", SECRET)).toBeNull();
    expect(await verifyState("a.b", "n", SECRET)).toBeNull();
  });
});
