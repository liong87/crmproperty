/** StorageProvider contract. Exposes business-level methods, never S3Client instances. */
export interface StorageProvider {
  /** Upload bytes and return the storage_key to persist (NOT a full URL). */
  upload(key: string, body: Uint8Array | Buffer, contentType: string): Promise<string>;
  /**
   * Presigned URL for temporary read access.
   *
   * `downloadAs` forces the browser to download rather than render, which matters for
   * anything that is not a photograph: an uploaded file we serve inline runs in the
   * storage origin, and the safest way to never care about that is to never render it.
   */
  getSignedUrl(
    key: string,
    expiresInSeconds?: number,
    downloadAs?: string | null,
  ): Promise<string>;
  delete(key: string): Promise<void>;
}
