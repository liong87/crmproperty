// Cloudflare Workers adapter config (Option B hosting).
// Docs: https://opennext.js.org/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
  // Next.js's incremental cache lives in R2 rather than on local disk,
  // because Workers have no persistent filesystem.
  incrementalCache: r2IncrementalCache,
});
