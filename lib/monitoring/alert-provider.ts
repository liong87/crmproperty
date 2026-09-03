import type { MonitoringProvider } from "./interface";
import { consoleProvider, scrub } from "./console-provider";

/**
 * Logging PLUS a push alert, for the failures somebody needs to hear about.
 *
 * The gap this closes: `consoleProvider` writes good structured JSON and Cloudflare
 * Workers Observability makes it searchable — but searchable is not the same as
 * noticed. Nothing told anyone a failure had happened, so production problems were
 * found either by looking on purpose or by an agent complaining. Two CPU-limit
 * outages and a reports page returning 500 were all discovered the second way.
 *
 * Deliberately a webhook rather than an error-tracking SDK: it needs no vendor
 * account, no dependency in the Worker bundle, and points at whatever the agency
 * already reads — a Slack or Discord incoming webhook, or an email-relay endpoint.
 * `MONITORING_WEBHOOK_URL` unset means this behaves exactly like consoleProvider,
 * which is what local development and `next build` want.
 *
 * The payload carries `text` and `content` because Slack reads the first and Discord
 * the second; sending both means the same URL works for either without a config flag.
 */

/** How long the same error stays muted, so a hot loop cannot spam the channel. */
const MUTE_MS = 5 * 60 * 1000;

/** How many distinct errors to remember. Bounded so this cannot grow unboundedly. */
const MAX_TRACKED = 200;

/**
 * Seen-recently map, per isolate.
 *
 * Cloudflare runs many isolates, so this does not dedupe globally — a burst can
 * still produce one alert per isolate. That is the right trade: a shared counter
 * would mean a KV round trip on every error, on the path of a request that is
 * already failing. The goal is "do not send four hundred messages about one broken
 * query", not exactly-once delivery.
 */
const lastSent = new Map<string, number>();

function shouldSend(key: string, now: number): boolean {
  const previous = lastSent.get(key);
  if (previous !== undefined && now - previous < MUTE_MS) return false;

  if (lastSent.size >= MAX_TRACKED) {
    // Drop the oldest rather than clearing: clearing would un-mute everything at once.
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, at] of lastSent) {
      if (at < oldestAt) {
        oldestAt = at;
        oldestKey = k;
      }
    }
    if (oldestKey !== null) lastSent.delete(oldestKey);
  }

  lastSent.set(key, now);
  return true;
}

/**
 * Post the alert without making the user wait for it.
 *
 * Not awaited by the caller: the request that triggered this is already failing, and
 * blocking its response on a third-party webhook would turn a handled error into a
 * timeout. Any failure to deliver is logged and otherwise ignored — an alerting
 * system that can break the app it watches is worse than no alerting.
 */
function post(url: string, body: unknown): void {
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => {
    console.error(
      JSON.stringify({
        level: "error",
        event: "alert-delivery-failed",
        at: new Date().toISOString(),
        message: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}

export const alertProvider: MonitoringProvider = {
  captureException(error, context) {
    // Always log first. If the webhook is misconfigured the record must still exist.
    consoleProvider.captureException(error, context);

    const url = process.env.MONITORING_WEBHOOK_URL;
    if (!url) return;

    const message = error instanceof Error ? error.message : String(error);
    const where = typeof context?.where === "string" ? context.where : "unknown";

    // Mute on where+message, not on the stack: the same fault from one call site is
    // one problem however many requests hit it.
    if (!shouldSend(`${where}::${message}`, Date.now())) return;

    /*
     * `scrub` before sending, for the same reason the console provider scrubs: an
     * error's context in this codebase can carry a lead's phone number or a client's
     * name, and a Slack channel is a second, unlogged, un-erasable copy of PDPA data
     * in a system the agency does not control. The message itself is included
     * un-scrubbed because it is developer-authored text, not record content — if that
     * ever stops being true, this is the line to revisit.
     */
    const text = `CRM error in ${where}: ${message}`;
    post(url, {
      text,
      content: text,
      detail: {
        where,
        errorName: error instanceof Error ? error.name : typeof error,
        at: new Date().toISOString(),
        context: scrub(context),
      },
    });
  },

  captureMessage(message, context) {
    // Messages are informational by design (`captureMessage("Meta leadgen not found")`)
    // and are logged only. Alerting on them would train everyone to ignore the channel.
    consoleProvider.captureMessage(message, context);
  },
};
