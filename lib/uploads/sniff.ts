/**
 * Identify an uploaded file from its bytes rather than its declared type.
 *
 * `File.type` in a multipart upload is whatever the client said it was. A file named
 * photo.jpg, declared image/jpeg, can contain anything — and whatever we are told is
 * what we store on the object and hand back on a signed URL later. Checking the first
 * few bytes costs nothing and removes the client's say in the matter.
 *
 * Deliberately narrow: it recognises exactly the formats the app accepts and returns
 * null for everything else. This is an allowlist, not a general-purpose detector, and
 * "I don't know what this is" must mean rejection.
 *
 * Note ZIP-based Office files (docx, xlsx, pptx) all look identical here — they are
 * ZIP archives. That is as far as magic bytes can take you; distinguishing them means
 * reading the archive index, which is not worth it when the accepted set is this small.
 */

export type SniffedType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf"
  /** Any ZIP container — in practice docx/xlsx/pptx. */
  | "application/zip"
  /** Legacy OLE compound file — .doc, .xls. */
  | "application/x-ole-storage";

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

/**
 * @returns the detected type, or null when the bytes match nothing we accept.
 */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // WebP: "RIFF" .... "WEBP" — the size field sits between the two markers.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  // PDF: "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  // ZIP: "PK" followed by a local file header, an empty archive, or a spanned one.
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "application/zip";
  }

  // OLE compound file (legacy .doc/.xls): D0 CF 11 E0 A1 B1 1A E1
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "application/x-ole-storage";
  }

  return null;
}

/** The three image types the app stores. */
export const IMAGE_TYPES: SniffedType[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Document uploads: PDFs, Office files old and new, and images (a phone photo of a
 * signed page is a legitimate document here).
 */
export const DOCUMENT_TYPES: SniffedType[] = [
  "application/pdf",
  "application/zip",
  "application/x-ole-storage",
  ...IMAGE_TYPES,
];

/**
 * Check bytes against an allowlist.
 *
 * @returns the sniffed type when acceptable, or null — callers should reject on null
 *          rather than falling back to the declared type.
 */
export function acceptedType(bytes: Uint8Array, allowed: SniffedType[]): SniffedType | null {
  const sniffed = sniffType(bytes);
  return sniffed && allowed.includes(sniffed) ? sniffed : null;
}
