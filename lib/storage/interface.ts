/** StorageProvider contract. Exposes business-level methods, never S3Client instances. */
export interface StorageProvider {
  /** Upload bytes and return the storage_key to persist (NOT a full URL). */
  upload(key: string, body: Uint8Array | Buffer, contentType: string): Promise<string>;
  /** Presigned URL for temporary read access. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
