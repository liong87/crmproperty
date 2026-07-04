/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Deployed to Cloudflare Workers via @opennextjs/cloudflare (Node.js runtime).
  // Keep app code standard Next.js — no Workers-specific APIs in /app or /server.
};

export default nextConfig;
