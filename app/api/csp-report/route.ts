import { NextResponse } from "next/server";
import { monitoring } from "@/lib/monitoring";

/**
 * Where the browser reports what the Content-Security-Policy WOULD have blocked.
 *
 * The CSP in next.config.mjs has been Report-Only since it was written, with a comment
 * saying to promote it once the console stays quiet. Nobody could act on that: with no
 * `report-uri`, violations went only to each individual browser's console, on each
 * individual agent's phone. There was no way to know whether enforcing it would break
 * sign-in until it broke sign-in.
 *
 * This endpoint makes the decision evidential. Run it for a week of real use, read the
 * distinct `blocked` values out of Workers Observability, widen the policy for anything
 * legitimate, then rename the header to `Content-Security-Policy`.
 *
 * PUBLIC BY NECESSITY — the browser posts these without credentials, and a violation
 * on the sign-in page happens before anyone is authenticated. It is therefore treated
 * as hostile input: nothing is stored, only a fixed set of short fields is logged, and
 * anyone can post junk to it. That is acceptable because the output is a diagnostic
 * signal, not a security control. Rate-limited so it cannot be used to flood the logs.
 */
export const dynamic = "force-dynamic";

/** Bytes. A real report is well under 4KB; anything larger is not a browser. */
const MAX_BODY = 8_192;

/** Per-isolate mute, so a page in a redirect loop cannot fill the log. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let seenInWindow = 0;

function withinBudget(now: number): boolean {
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    seenInWindow = 0;
  }
  seenInWindow += 1;
  return seenInWindow <= MAX_PER_WINDOW;
}

/** Keep it short, and never echo it anywhere a browser will render it. */
const trim = (v: unknown, n = 200): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, n) : undefined;

export async function POST(req: Request): Promise<NextResponse> {
  // 204 on every path, including rejection. A browser does nothing with the response,
  // and an endpoint that reports its own parsing failures is a probing oracle.
  const done = new NextResponse(null, { status: 204 });

  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return done;
    if (!withinBudget(Date.now())) return done;

    const body: unknown = JSON.parse(raw);

    /*
     * Two wire formats, because browsers disagree: the original
     * `{"csp-report": {...}}` and the Reporting API's `[{ type, body }, ...]`.
     * Both are accepted so this works across the phones agents actually carry.
     */
    const reports: unknown[] = Array.isArray(body)
      ? body.map((r) => (r as { body?: unknown })?.body ?? r)
      : [(body as { "csp-report"?: unknown })?.["csp-report"] ?? body];

    for (const r of reports.slice(0, 5)) {
      const rep = (r ?? {}) as Record<string, unknown>;
      monitoring.captureMessage("csp-violation", {
        // `blockedURL` is the Reporting API spelling, `blocked-uri` the older one.
        blocked: trim(rep.blockedURL ?? rep["blocked-uri"]),
        directive: trim(rep.effectiveDirective ?? rep["effective-directive"] ?? rep["violated-directive"], 60),
        // The page it happened on — a CRM path, so no client data in it.
        page: trim(rep.documentURL ?? rep["document-uri"]),
        disposition: trim(rep.disposition, 20),
      });
    }
  } catch {
    // Malformed body. Nothing to log — the report is the diagnostic, and a broken one
    // tells us nothing except that somebody posted junk.
  }

  return done;
}
