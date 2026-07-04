import type { MonitoringProvider } from "./interface";

/**
 * Sentry wrapper. Import is lazy/guarded so the app runs without Sentry configured.
 * NEVER pass raw PII — scrub before calling (see scrub()).
 */
function scrub(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const redactKeys = ["phone", "email", "id_number", "idNumber", "name", "address"];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = redactKeys.includes(k) ? "[redacted]" : v;
  }
  return out;
}

export const sentryProvider: MonitoringProvider = {
  captureException(error, context) {
    if (!process.env.SENTRY_DSN) {
      console.error("[monitoring]", error);
      return;
    }
    // Dynamically required so builds without Sentry still work.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error, { extra: scrub(context) });
  },
  captureMessage(message, context) {
    if (!process.env.SENTRY_DSN) {
      console.log("[monitoring]", message);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs");
    Sentry.captureMessage(message, { extra: scrub(context) });
  },
};
