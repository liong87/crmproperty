import type { MonitoringProvider } from "./interface";

/**
 * Structured-console monitoring.
 *
 * Why not Sentry: the previous provider called `require("@sentry/nextjs")` at
 * runtime against an SDK that was never initialised (there is no
 * sentry.*.config.ts and next.config.mjs does not wrap withSentryConfig), so every
 * event was silently dropped — and because the console fallback was skipped
 * whenever SENTRY_DSN was set, *enabling* Sentry made error reporting worse. A bare
 * `require()` is also fragile inside a Cloudflare Workers bundle.
 *
 * Cloudflare Workers Observability (enabled in wrangler.jsonc) captures console
 * output and makes it searchable, which covers what Sentry was meant to provide.
 * Everything is emitted as single-line JSON so it can be queried by field.
 *
 * To adopt a real error tracker later, add a provider alongside this one and switch
 * lib/monitoring/index.ts — no app code changes, per the adapter rule.
 */

/** Keys never safe to emit. PDPA: logs must not become a second copy of client PII. */
const REDACT = new Set([
  "phone",
  "email",
  "id_number",
  "idNumber",
  "name",
  "address",
  "ownerName",
  "ownerPhone",
  "notes",
  "body",
  "password",
  "token",
  "accessToken",
  "apiKey",
  "secret",
]);

function scrub(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = REDACT.has(k) ? "[redacted]" : v;
  }
  return out;
}

function emit(level: "error" | "info", event: string, extra: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...extra,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const consoleProvider: MonitoringProvider = {
  captureException(error, context) {
    emit("error", "exception", {
      message: error instanceof Error ? error.message : String(error),
      // Name and stack only — never the error's arbitrary properties, which in this
      // codebase can carry a full row of client data.
      errorName: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 8).join(" | ") : undefined,
      context: scrub(context),
    });
  },
  captureMessage(message, context) {
    emit("info", "message", { message, context: scrub(context) });
  },
};
