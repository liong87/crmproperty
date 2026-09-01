/** @type {import('next').NextConfig} */
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
   * browser reports what it WOULD have blocked to the console. Run the app normally
   * for a week — sign in, upload a photo, open a document, view every report — and
   * watch for violations. When the console stays quiet, rename the header to
   * `Content-Security-Policy` to enforce it.
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
          // No page here needs a camera, microphone or location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // REPORT-ONLY. See the note above before promoting this to enforcing.
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // Clerk ships its SDK from its own domains and needs eval for its
              // dev-instance tooling. 'unsafe-inline' is here because Next emits
              // inline bootstrap scripts; removing it needs nonces, which is a
              // separate piece of work.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com",
              "worker-src 'self' blob:",
              // Tailwind is compiled to a stylesheet, but Next injects inline styles.
              "style-src 'self' 'unsafe-inline'",
              // Property photographs arrive as signed R2 URLs; data: covers the
              // client-side resize canvas; blob: covers object URLs for previews.
              "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://img.clerk.com",
              "font-src 'self' data:",
              // The sales kit uploads straight from the browser to R2 (presigned PUT),
              // so the bucket host must be reachable by fetch, not just as an image.
              "connect-src 'self' https://*.r2.cloudflarestorage.com https://*.clerk.accounts.dev https://*.clerk.com",
              // Clerk renders sign-in components in an iframe on development
              // instances; production instances do not need this.
              "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
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
