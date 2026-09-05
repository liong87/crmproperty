/** @type {import('next').NextConfig} */
/*
 * Clerk's Frontend API host.
 *
 * A Clerk PRODUCTION instance is served from a CNAME on your own domain, so it matches
 * neither `*.clerk.accounts.dev` (development instances) nor `*.clerk.com`. The
 * report-only CSP caught this: `connect-src` was refusing the session `tokens` and
 * `touch` calls, which are how a session stays alive. Report-only means nothing broke —
 * but enforcing the policy without this line would have signed every agent out mid-shift
 * and looked like an auth outage rather than a header change.
 *
 * Listed in script-src as well as connect-src: the same host serves clerk.js on a
 * production instance, and a missing script-src entry fails closed and total.
 */
const CLERK_FAPI = "https://clerk.lanthornproperties.com";

/*
 * Cloudflare Web Analytics.
 *
 * The zone injects `beacon.min.js` into every HTML response, so this script is not
 * ours and does not appear anywhere in the source — it showed up only as a
 * report-only `script-src-elem` violation in `wrangler tail`.
 *
 * script-src ONLY. Cloudflare's docs distinguish the two install paths: an
 * auto-injected beacon reports back to `'self'` (already allowed), while a manually
 * embedded one posts to cloudflareinsights.com. Ours is auto-injected — no
 * connect-src violation was ever reported for it — so widening connect-src as well
 * would loosen the policy for a request that is never made.
 */
const CF_INSIGHTS = "https://static.cloudflareinsights.com";

const nextConfig = {
  reactStrictMode: true,

  // Drop the `x-powered-by: Next.js` header. It tells anyone scanning which
  // framework and therefore which advisories to try. No defence on its own, but
  // there is no reason to volunteer it.
  poweredByHeader: false,

  /**
   * File uploads arrive as FormData through SERVER ACTIONS (uploadChecklistFile,
   * property photos), so Next's server-action body cap — not the app's own check —
   * decides what actually gets through. The default is 1 MB, well under the 15 MB
   * MAX_BYTES in server/deal-documents/actions.ts, so a 3 MB scanned SPA or IC photo
   * was rejected by the framework with an opaque error before that friendly check
   * ever ran. Keep this at or above MAX_BYTES.
   *
   * Sales-kit files no longer come through here — they PUT straight to R2 with a
   * presigned URL, which is what makes brochure-sized files possible at all on
   * Workers' free plan (10 ms CPU per request). This limit still governs property
   * photos and deal-document uploads, which remain server actions.
   */
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
  // Deployed to Cloudflare Workers via @opennextjs/cloudflare (Node.js runtime).
  // Keep app code standard Next.js — no Workers-specific APIs in /app or /server.

  /**
   * Security headers.
   *
   * A Content-Security-Policy is included in REPORT-ONLY mode. It blocks nothing; the
   * browser reports what it WOULD have blocked to /api/csp-report, which logs each
   * violation through the monitoring provider.
   *
   * TO PROMOTE IT, and not before: run a week of real use — sign in, upload a photo,
   * open a document, view every report, connect Facebook — then read the distinct
   * `blocked` values out of Workers Observability (`event: "message"`,
   * `message: "csp-violation"`). Widen the policy for anything legitimate. When a week
   * passes with no new violation, rename this header to `Content-Security-Policy`.
   *
   * It was report-only with NO reporting endpoint for months, which made the
   * instruction above impossible to follow: violations went to each agent's private
   * browser console and nobody could see them.
   *
   * Switching it on before that would break sign-in: Clerk loads scripts and workers
   * from its own domains, and property photographs come from signed R2 URLs. Both are
   * allowed for below, but the list is a best guess until real usage proves it.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Browsers that have visited once will refuse plain HTTP afterwards.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Stop the browser guessing content types — an uploaded file that sniffs
          // as HTML would otherwise run in the origin's context.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clickjacking. This app has destructive actions one click away
          // (Disqualify, Deactivate, PDPA erasure), so framing must be refused.
          { key: "X-Frame-Options", value: "DENY" },
          // Record ids appear in URLs; do not leak full paths to third parties.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // This CRM is internal to the agency. Nothing in it should ever appear in a
          // search result, and a sign-in page is exactly what gets indexed and then
          // probed. Cloudflare Access already stops a crawler at the edge; this is the
          // second lock, for the day somebody turns Access off.
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          // No page here needs a camera, microphone or location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          /*
           * Where violations are reported. Without this the policy was unfalsifiable:
           * report-only with no endpoint means every violation lands in one agent's
           * private browser console and nobody can act on it.
           *
           * `report-uri` is deprecated but is what Safari and older Chrome still send;
           * `report-to` is the modern one and needs the Reporting-Endpoints header
           * below. Both are set so reports arrive from every phone in the agency.
           */
          { key: "Reporting-Endpoints", value: 'csp="/api/csp-report"' },
          // REPORT-ONLY. See the note above before promoting this to enforcing.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "report-uri /api/csp-report",
              "report-to csp",
              // Clerk ships its SDK from its own domains and needs eval for its
              // dev-instance tooling. 'unsafe-inline' is here because Next emits
              // inline bootstrap scripts; removing it needs nonces, which is a
              // separate piece of work.
              `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com ${CLERK_FAPI} ${CF_INSIGHTS}`,
              "worker-src 'self' blob:",
              // Tailwind is compiled to a stylesheet, but Next injects inline styles.
              "style-src 'self' 'unsafe-inline'",
              // Property photographs arrive as signed R2 URLs; data: covers the
              // client-side resize canvas; blob: covers object URLs for previews.
              `img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://img.clerk.com ${CLERK_FAPI}`,
              "font-src 'self' data:",
              // The sales kit uploads straight from the browser to R2 (presigned PUT),
              // so the bucket host must be reachable by fetch, not just as an image.
              `connect-src 'self' https://*.r2.cloudflarestorage.com https://*.clerk.accounts.dev https://*.clerk.com ${CLERK_FAPI}`,
              // Clerk renders sign-in components in an iframe on development
              // instances; production instances do not need this.
              `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com ${CLERK_FAPI}`,
              // Nothing here should ever be framed, or submit a form off-site.
              "frame-ancestors 'none'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
