import { describe, it, expect } from "vitest";
import { timingSafeEqual, hmacBase64, hmacHex, providerSecret } from "./verify";

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });
  it("rejects different strings of equal length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });
  it("rejects different lengths (no early exit / no throw)", () => {
    expect(timingSafeEqual("abc", "abcdef")).toBe(false);
    expect(timingSafeEqual("abcdef", "abc")).toBe(false);
  });
  it("rejects empty against non-empty", () => {
    expect(timingSafeEqual("", "x")).toBe(false);
    expect(timingSafeEqual("x", "")).toBe(false);
  });
  it("treats two empties as equal", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
  it("handles multi-byte characters without false positives", () => {
    expect(timingSafeEqual("Ali", "Alí")).toBe(false);
  });
});

describe("hmac helpers", () => {
  // Known-answer test: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog")
  const KEY = "key";
  const MSG = "The quick brown fox jumps over the lazy dog";
  const HEX = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

  it("produces the known hex digest", async () => {
    expect(await hmacHex(KEY, MSG)).toBe(HEX);
  });
  it("produces base64 consistent with the hex digest", async () => {
    const b64 = await hmacBase64(KEY, MSG);
    const fromHex = Buffer.from(HEX, "hex").toString("base64");
    expect(b64).toBe(fromHex);
  });
  it("changes when the payload changes by one byte", async () => {
    const a = await hmacBase64(KEY, MSG);
    const b = await hmacBase64(KEY, MSG + " ");
    expect(a).not.toBe(b);
  });
  it("changes when the secret changes", async () => {
    expect(await hmacBase64("key1", MSG)).not.toBe(await hmacBase64("key2", MSG));
  });
});

describe("providerSecret", () => {
  it("reads WEBHOOK_SECRET_<PROVIDER>", () => {
    process.env.WEBHOOK_SECRET_TALLY = "s3cret";
    expect(providerSecret("tally")).toBe("s3cret");
  });
  it("is case-insensitive on the provider name", () => {
    process.env.WEBHOOK_SECRET_GOOGLEADS = "gkey";
    expect(providerSecret("googleAds")).toBe("gkey");
  });
  it("returns null when unset, so callers fail closed", () => {
    delete process.env.WEBHOOK_SECRET_NOPE;
    expect(providerSecret("nope")).toBeNull();
  });
  it("returns null for an empty value rather than treating '' as valid", () => {
    process.env.WEBHOOK_SECRET_EMPTY = "";
    expect(providerSecret("empty")).toBeNull();
  });
  it("sanitises unexpected characters in the provider name", () => {
    process.env.WEBHOOK_SECRET_ODD_NAME = "v";
    expect(providerSecret("odd-name")).toBe("v");
  });
});
