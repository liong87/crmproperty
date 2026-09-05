/**
 * Runs once when the server starts (Next.js instrumentation hook).
 *
 * Purpose: turn configuration mistakes into a loud failure at deploy time rather
 * than an opaque error on a user's first request. This does NOT run during
 * `next build`, so builds continue to work without real secrets.
 */
import { checkEnv, formatEnvReport } from "@/lib/env";

export async function register() {
  /*
   * `migrations: false` — this is the SERVER, and it never runs DDL.
   *
   * The pooler/DIRECT_DATABASE_URL warning is real and worth keeping for the CLI, but
   * here it fired on every isolate start for a condition the Worker cannot hit. In a
   * `wrangler tail` session chasing an actual fault it was most of the output.
   */
  const { fatal, warnings } = checkEnv({ migrations: false });

  if (warnings.length > 0) {
    console.warn(formatEnvReport(warnings, "[config] Warnings — some features are unavailable:"));
  }

  if (fatal.length > 0) {
    const report = formatEnvReport(fatal, "[config] FATAL — required configuration is missing:");
    console.error(report);

    // In production a misconfigured deploy should not accept traffic: failing here
    // is visible in the platform's logs and health checks. In development we only
    // warn, so a partially-configured local checkout is still usable.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Missing required configuration: ${fatal.map((f) => f.variable).join(", ")}`,
      );
    }
  }

  if (fatal.length === 0 && warnings.length === 0) {
    console.log("[config] All required environment variables present.");
  }
}
