/**
 * Rate limiting for the public, unauthenticated endpoints.
 *
 * Why this exists: /api/public/leads authenticates with an API key that is, by
 * design, embedded in a landing page — anyone who views source can read it. Without
 * a limit that key can insert unlimited leads: the database fills, agents' lists
 * become unusable, and PDPA consent records get written for people who never
 * consented.
 *
 * Uses Cloudflare's Workers rate-limiting binding rather than a WAF rule, because
 * dashboard rate-limiting rules apply to zones (real domains) and this app is served
 * from *.workers.dev. The binding runs inside the Worker, so it works on either.
 *
 * Fails OPEN. If the binding is missing — local development, `pnpm dev`, the test
 * suite, or a non-Cloudflare host — requests are allowed through. That is the right
 * trade-off here: the limiter protects against flooding, and breaking lead capture
 * because a binding is unavailable would cost real business. The API key remains the
 * actual access control.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Shape of the Workers rate-limiting binding. */
interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Best-effort client IP.
 *
 * CF-Connecting-IP is set by Cloudflare itself and cannot be spoofed by the client,
 * so it is preferred. The others are fallbacks for non-Cloudflare hosting; they are
 * client-supplied and therefore only advisory.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Consume one unit against `binding` for `key`.
 *
 * @returns true when the caller is within the limit (or limiting is unavailable).
 */
export async function withinRateLimit(binding: string, key: string): Promise<boolean> {
  try {
    const env = getCloudflareContext()?.env as Record<string, unknown> | undefined;
    const limiter = env?.[binding] as RateLimitBinding | undefined;
    if (!limiter?.limit) {
      // Failing open is deliberate, but it must not be silent: a limiter that
      // quietly does nothing looks identical to one that is working until the day
      // someone floods the endpoint. Logged so it is visible in Workers Logs.
      console.warn(
        `[rate-limit] binding ${binding} unavailable — request allowed. ` +
          `env keys: ${env ? Object.keys(env).join(",") : "(no env)"}`,
      );
      return true;
    }
    const { success } = await limiter.limit({ key });
    if (!success) console.warn(`[rate-limit] ${binding} blocked key=${key}`);
    return success;
  } catch (err) {
    console.warn(
      `[rate-limit] ${binding} threw, request allowed: ` +
        (err instanceof Error ? err.message : String(err)),
    );
    // Never let the limiter itself take the endpoint down.
    return true;
  }
}

/** 429 with Retry-After, merged with whatever headers the caller already sends. */
export function tooManyRequests(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ ok: false, error: "Too many requests" }), {
    status: 429,
    headers: {
      ...headers,
      "Content-Type": "application/json",
      // The binding's period is 60s, so a full minute is the honest answer.
      "Retry-After": "60",
    },
  });
}
