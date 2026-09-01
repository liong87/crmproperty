import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./interface";

/**
 * Cloudflare R2 (S3-compatible). Migrate to S3/B2/MinIO by changing env only.
 *
 * The client is built LAZILY on first use. Previously it was constructed at module
 * scope reading `process.env.S3_BUCKET!` and friends with non-null assertions, so an
 * unset variable produced an S3Client with undefined credentials and the failure
 * surfaced as an opaque AWS SDK error on an agent's first photo upload. Now a
 * missing variable produces a clear message naming it, and lib/env.ts catches the
 * same problem at server start.
 */

interface Config {
  client: S3Client;
  bucket: string;
}

let cached: Config | null = null;

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Object storage is not configured: ${name} is missing. ` +
        "Set S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.",
    );
  }
  return value;
}

function config(): Config {
  if (cached) return cached;
  cached = {
    bucket: required("S3_BUCKET"),
    client: new S3Client({
      region: process.env.S3_REGION ?? "auto",
      // AWS SDK v3.729+ adds a CRC32 checksum to every request by default. For a
      // PRESIGNED PUT that is fatal: the checksum is computed at signing time, when
      // there is no body, so `x-amz-checksum-crc32=AAAAAA==` gets baked into the URL
      // and R2 then rejects the real bytes for not matching it. Server-side uploads
      // are unaffected (they have the body to hand), but the setting is global, and
      // WHEN_REQUIRED still sends a checksum wherever the API actually demands one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      endpoint: required("S3_ENDPOINT"),
      credentials: {
        accessKeyId: required("S3_ACCESS_KEY_ID"),
        secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
      },
    }),
  };
  return cached;
}

export const r2Provider: StorageProvider = {
  async upload(key, body, contentType) {
    const { client, bucket } = config();
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  },
  // 15 minutes, not an hour. A signed URL is a bearer token for that file: anyone
  // holding the link can fetch the photograph, and links get pasted into chats and
  // captured in screenshots. Pages mint fresh URLs on every load, so a short window
  // costs nothing — the only limit is how long a page can sit open before its
  // images stop loading, and 15 minutes is comfortably past a normal visit.
  async getSignedUrl(key, expiresInSeconds = 900, downloadAs = null) {
    const { client, bucket } = config();

    // Quotes and non-ASCII break the header, and a filename is user-supplied.
    const safe = downloadAs ? downloadAs.replace(/[^\w.\- ]/g, "_").slice(0, 120) : null;

    return getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        // Response headers are signed into the URL, so this cannot be stripped by
        // editing the link.
        ...(safe
          ? {
              ResponseContentDisposition: `attachment; filename="${safe}"`,
              // Never let the browser render it, whatever the object's stored type.
              ResponseContentType: "application/octet-stream",
            }
          : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  },
  /**
   * 15 minutes, same reasoning as the read URL: it is a bearer token to write one
   * object at one key, and the browser uses it immediately.
   */
  async getUploadUrl(key, contentType, expiresInSeconds = 900) {
    const { client, bucket } = config();
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  },
  async delete(key) {
    const { client, bucket } = config();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};
