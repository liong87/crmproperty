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
  /**
   * Presigned PUT URL so a BROWSER can upload straight to storage, without the bytes
   * passing through the server at all.
   *
   * On Cloudflare Workers this is not an optimisation, it is the difference between
   * working and not: the free plan allows 10 ms of CPU per request, and receiving,
   * buffering and re-uploading a multi-megabyte file does not fit in that budget.
   *
   * `contentType` is signed INTO the URL, so the holder can only store an object of
   * that exact type — the browser must send a matching Content-Type header or R2
   * rejects the PUT.
   */
  getUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
