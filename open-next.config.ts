// Cloudflare Workers adapter config (Option B hosting).
// Docs: https://opennext.js.org/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  /**
   * Next.js's incremental cache lives in the deployed static assets rather than R2.
   *
   * Why: the incremental cache only serves statically regenerated pages, and this
   * app has essentially none — the build marks every route except `/` and
   * `/_not-found` as dynamic, because each page is user-specific and
   * permission-scoped. An R2-backed cache would add a bucket, a binding and a
   * failure mode to cache almost nothing.
   *
   * R2 is still used for the two things that need it: property photographs and
   * database backups. Those are separate buckets with separate tokens.
   *
   * If the app later gains genuinely static, regenerated pages (a public listings
   * site, say), switch this back to r2IncrementalCache and recreate the bucket.
   */
  incrementalCache: staticAssetsIncrementalCache,
});
