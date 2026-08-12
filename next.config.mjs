/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deployed to Cloudflare Workers via @opennextjs/cloudflare (Node.js runtime).
  // Keep app code standard Next.js — no Workers-specific APIs in /app or /server.

  /**
   * Security headers.
   *
   * Deliberately the four that carry no compatibility risk. A Content-Security-Policy
   * belongs here too, but needs care before it is switched on: Clerk loads its script
   * from *.clerk.accounts.dev and property photographs come from signed R2 URLs on
   * *.r2.cloudflarestorage.com, so a strict policy would break sign-in and images.
   * Add it in report-only mode first.
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
        ],
      },
    ];
  },
};

export default nextConfig;
