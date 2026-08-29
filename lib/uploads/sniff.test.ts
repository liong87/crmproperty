import { describe, it, expect } from "vitest";
import { sniffType, acceptedType, IMAGE_TYPES, DOCUMENT_TYPES } from "./sniff";

const bytes = (...b: number[]) => new Uint8Array(b);
const pad = (head: number[], len = 32) =>
  new Uint8Array([...head, ...Array(Math.max(0, len - head.length)).fill(0)]);

describe("sniffType", () => {
  it("recognises JPEG", () => {
    expect(sniffType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("recognises PNG", () => {
    expect(sniffType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
  });

  it("recognises WebP, which needs the marker at offset 8", () => {
    const webp = pad([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(sniffType(webp)).toBe("image/webp");
  });

  it("does not mistake other RIFF containers for WebP", () => {
    // A WAV file is also RIFF, with "WAVE" where WebP has "WEBP".
    const wav = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffType(wav)).toBeNull();
  });

  it("recognises PDF and ZIP and legacy Office", () => {
    expect(sniffType(pad([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
    expect(sniffType(pad([0x50, 0x4b, 0x03, 0x04]))).toBe("application/zip");
    expect(sniffType(pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(
      "application/x-ole-storage",
    );
  });

  it("returns null for HTML dressed up as an upload — the case this exists for", () => {
    // "<!DOCTYPE html>"
    const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
    expect(sniffType(html)).toBeNull();
  });

  it("returns null for an empty or truncated file rather than guessing", () => {
    expect(sniffType(new Uint8Array())).toBeNull();
    expect(sniffType(bytes(0xff))).toBeNull();
    expect(sniffType(bytes(0xff, 0xd8))).toBeNull(); // one byte short of JPEG
  });
});

describe("acceptedType", () => {
  it("accepts an image where images are allowed", () => {
    expect(acceptedType(pad([0xff, 0xd8, 0xff]), IMAGE_TYPES)).toBe("image/jpeg");
  });

  it("rejects a PDF where only images are allowed", () => {
    expect(acceptedType(pad([0x25, 0x50, 0x44, 0x46, 0x2d]), IMAGE_TYPES)).toBeNull();
  });

  it("accepts a photo of a signed page as a document", () => {
    expect(acceptedType(pad([0xff, 0xd8, 0xff]), DOCUMENT_TYPES)).toBe("image/jpeg");
  });

  it("rejects unknown bytes rather than falling back to the declared type", () => {
    expect(acceptedType(new TextEncoder().encode("not a file"), DOCUMENT_TYPES)).toBeNull();
  });
});
