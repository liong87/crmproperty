/**
 * Retry a read once when the connection dies underneath it.
 *
 * In a Workers/Hyperdrive deployment a pooled socket can be closed at any moment by
 * something outside this process — the runtime reclaiming it, Hyperdrive recycling its
 * pool, a limit being reached somewhere we cannot see. postgres-js does not find out
 * until it writes, and then reports
 *
 *   write CONNECTION_CLOSED <id>.hyperdrive.local:5432
 *
 * wrapped by drizzle as `Failed query: <sql>`. The statement never reached PostgreSQL,
 * so nothing ran and nothing was half-applied.
 *
 * This is deliberately a MITIGATION and is documented as one. Two separate theories
 * about the underlying cause — Date serialisation, then the per-invocation connection
 * cap — each looked right and each still failed in production. What is certain is the
 * shape of the failure: a transport error, before execution, on a read. That is
 * precisely the case where retrying is both safe and correct, whatever the cause turns
 * out to be.
 *
 * SAFETY: only for idempotent reads. Do NOT wrap writes with this — a socket can also
 * die AFTER the server received the statement, and a retried INSERT would then run
 * twice. Every caller must be a pure SELECT.
 */

/** Does this error, or anything it wraps, look like a dead connection? */
export function isConnectionError(err: unknown): boolean {
  const TRANSPORT = new Set([
    "CONNECTION_CLOSED",
    "CONNECTION_DESTROYED",
    "CONNECTION_ENDED",
    "CONNECT_TIMEOUT",
    "ECONNRESET",
    "EPIPE",
  ]);
  let e: unknown = err;
  for (let depth = 0; e && depth < 5; depth++) {
    const o = e as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (typeof o.code === "string" && TRANSPORT.has(o.code)) return true;
    if (typeof o.errno === "string" && TRANSPORT.has(o.errno)) return true;
    // postgres-js puts the code in the message for socket-level write failures.
    if (typeof o.message === "string" && /CONNECTION_CLOSED|CONNECT_TIMEOUT|ECONNRESET/.test(o.message)) return true;
    e = o.cause;
  }
  return false;
}

/**
 * Run `fn`; if it fails with a transport error, run it exactly once more.
 *
 * One retry, not a loop with backoff: if the second attempt also fails the problem is
 * not a stale socket, and turning a fast 500 into a slow one helps nobody. The brief
 * pause lets postgres-js discard the dead connection before it opens a fresh one.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, where: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    console.warn(`[${where}] connection died mid-read; retrying once`);
    await new Promise((r) => setTimeout(r, 50));
    return fn();
  }
}
