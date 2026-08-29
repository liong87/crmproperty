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
  async delete(key) {
    const { client, bucket } = config();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};
