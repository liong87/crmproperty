import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./interface";

/** Cloudflare R2 (S3-compatible). Migrate to S3/B2/MinIO by changing env only. */
const bucket = process.env.S3_BUCKET!;

const client = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const r2Provider: StorageProvider = {
  async upload(key, body, contentType) {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return key;
  },
  async getSignedUrl(key, expiresInSeconds = 3600) {
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  },
  async delete(key) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};
