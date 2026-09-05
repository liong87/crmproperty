/**
 * Database client — the ONLY place provider-specific database code is allowed.
 * Everything else uses Drizzle with standard PostgreSQL. Moving between Supabase,
 * a VPS, RDS or a local container is this one file plus DATABASE_URL.
 *
 * Uses `postgres` (postgres-js) over a plain connection string rather than any
 * vendor SDK. That is deliberate: it keeps Supabase interchangeable with any other
 * PostgreSQL server, and unlike the previous Neon HTTP driver it supports real
 * TRANSACTIONS — which server/leads/convert.ts and the round-robin assignment need
 * in order to be correct rather than "atomic enough".
 *
 * The connection is created LAZILY (on first query) via a Proxy, so importing this
 * module during `next build` does not require DATABASE_URL — only running a query does.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Supabase (and any serverless deployment) requires the connection POOLER.
 *
 *   app         pooler port 6543, TRANSACTION mode  ← DATABASE_URL
 *   migrations  pooler port 5432, SESSION mode      ← DIRECT_DATABASE_URL
 *
 * Note: Supabase's "direct connection" host (db.<ref>.supabase.co) is IPv6-only
 * unless you buy the IPv4 add-on, so on an IPv4 network it fails with ENOTFOUND.
 * The SESSION-mode pooler is IPv4 on all tiers and supports DDL, so migrations use
 * that instead.
 *
 * Transaction-mode pooling cannot hold server-side prepared statements, hence
 * `prepare: false`. Leaving it on produces intermittent
 * "prepared statement already exists" errors under concurrency — the kind of bug
 * that only appears once two agents are using the system at the same time.
 */
/**
 * Cloudflare Workers cannot open a TLS socket to Supabase directly — postgres-js
 * hangs in the TLS handshake and the runtime cancels the request after 30s.
 * Hyperdrive is Cloudflare's connection proxy: the Worker talks to a local,
 * non-TLS endpoint and Hyperdrive holds the real pooled connections to Supabase.
 *
 * Returns undefined everywhere except the Workers runtime, so local development,
 * the CLI scripts and any non-Cloudflare host fall through to DATABASE_URL and this
 * file stays portable.
 */
function hyperdriveConnectionString(): string | undefined {
  try {
    // Throws outside the Workers request context (local dev, scripts, tests) —
    // which is exactly when we want to fall through to DATABASE_URL.
    const env = getCloudflareContext()?.env as
      | { HYPERDRIVE?: { connectionString?: string } }
      | undefined;
    return env?.HYPERDRIVE?.connectionString;
  } catch {
    return undefined;
  }
}

function createClient() {
  const hyperdrive = hyperdriveConnectionString();
  const connectionString = hyperdrive ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Hyperdrive terminates TLS itself and exposes a plaintext local endpoint, so
  // requiring TLS on this hop would fail. Connection pooling is Hyperdrive's job
  // too, hence a small per-isolate max.
  if (hyperdrive) {
    return postgres(connectionString, {
      /*
       * THREE, not Cloudflare's example of five.
       *
       * A Worker invocation may hold at most SIX simultaneous outbound TCP
       * connections; Cloudflare's `max: 5` assumes the database is the only thing
       * opening any. It is not. The dashboard layout calls `syncCurrentUser()`, which
       * is an HTTPS round trip to Clerk's API, and it runs concurrently with the
       * funnel's EIGHT parallel queries — so a pool of five sat exactly on the cap
       * with the RSC prefetch racing the real request beside it.
       *
       * Over the cap, the runtime closes a socket. postgres-js does not find out
       * until it writes to it, and then reports
       *   write CONNECTION_CLOSED <id>.hyperdrive.local:5432
       * against whichever statement it happened to be holding — which is why the
       * failing query was different every time and never the one at fault.
       *
       * Three leaves headroom for Clerk plus any other subrequest. It costs almost
       * nothing: Hyperdrive owns the real pool server-side, the hop is local, and
       * postgres-js pipelines the eight funnel queries over the sockets it has.
       */
      max: 3,
      // Avoids an extra round-trip on every connection. Safe here: the schema uses
      // no custom array types.
      fetch_types: false,
      // Retire a socket rather than discover it is dead by writing to it. Within a
      // single request this rarely fires; it matters for any client that outlives one.
      idle_timeout: 10,
      max_lifetime: 60,
      ssl: false,
      onnotice: () => {},
    });
  }

  // Only TRANSACTION mode (port 6543) forbids prepared statements. Session mode on
  // the same pooler host (port 5432) supports them, and disabling them there would
  // cost performance for no reason.
  const transactionPooler = /:6543(\/|$|\?)/.test(connectionString);

  // Pool size: serverless runtimes create MANY short-lived instances, so one
  // connection each keeps us inside Supabase's limit. Local development is the
  // opposite - a single long-lived process serving parallel queries - and max:1
  // there serialises every query behind one connection, which makes pages that
  // fan out (the dashboard) crawl.
  const isDev = process.env.NODE_ENV !== "production";
  const defaultMax = isDev ? 10 : 1;

  return postgres(connectionString, {
    max: Number(process.env.DB_POOL_MAX ?? defaultMax),
    idle_timeout: 20,
    // Supabase free tier runs on the smallest compute, and the first connection
    // after a quiet period can be slow while the instance warms up.
    connect_timeout: 30,
    prepare: transactionPooler ? false : undefined,
    // Supabase terminates non-TLS connections. `require` verifies transport without
    // demanding a locally trusted CA chain, which is what managed providers expect.
    ssl: process.env.DB_SSL === "disable" ? false : "require",
    // Never let the driver print connection strings or parameters on error.
    onnotice: () => {},
  });
}

function createDb() {
  return drizzle(createClient(), { schema });
}

type DrizzleDb = ReturnType<typeof createDb>;

/**
 * Long-lived singleton — correct for Node (one process, many requests).
 *
 * Held on `globalThis`, NOT in module scope, and the reason is specific to
 * development. Next's dev server discards and re-evaluates modules on every hot
 * reload. A module-scoped `let` is re-initialised each time, so every reload built a
 * fresh `postgres()` pool — up to `max` connections — and orphaned the previous one
 * with its connections still open. Nothing closed them: the old module instance was
 * unreachable, so no code was left to call `.end()`.
 *
 * After an afternoon of edits that is dozens of abandoned pools holding hundreds of
 * connections, and Supabase's pooler starts refusing new clients. It presents as the
 * application getting progressively slower over a session — 1.6s, then 65s, then
 * 130s — and finally as trivial queries failing outright, while a standalone script
 * against the same database stays fast because it owns exactly one pool. That is a
 * miserable thing to debug, because every measurement taken outside the dev server
 * exonerates the database.
 *
 * `globalThis` survives module re-evaluation, so the pool is created once per
 * process. In production modules are evaluated once anyway and this is simply a
 * singleton.
 */
const GLOBAL_DB = Symbol.for("propertyagent.db");

interface DbGlobal {
  [GLOBAL_DB]?: DrizzleDb | null;
}

/**
 * Per-request instances for the Workers runtime.
 *
 * Module scope survives BETWEEN requests in a Workers isolate, but Cloudflare
 * forbids using a socket opened during one request in another — it throws
 * "Cannot perform I/O on behalf of a different request", surfacing as a 1101
 * "Worker threw exception". The first request in a fresh isolate succeeded and the
 * next one reusing it failed, which is why pages worked intermittently.
 *
 * Keyed on the per-request context object and held weakly, so entries disappear
 * when the request does. Creating a client per request is cheap and is what
 * Cloudflare recommends: Hyperdrive owns the real connection pool.
 */
const _requestDbs = new WeakMap<object, DrizzleDb>();

function resolveDb(): DrizzleDb {
  let requestKey: object | undefined;
  try {
    // ctx is a distinct object per request; env/cf are not.
    requestKey = (getCloudflareContext() as { ctx?: object } | undefined)?.ctx;
  } catch {
    requestKey = undefined;
  }

  if (requestKey) {
    let scoped = _requestDbs.get(requestKey);
    if (!scoped) {
      scoped = createDb();
      _requestDbs.set(requestKey, scoped);
    }
    return scoped;
  }

  const g = globalThis as DbGlobal;
  if (!g[GLOBAL_DB]) g[GLOBAL_DB] = createDb();
  return g[GLOBAL_DB];
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const target = resolveDb();
    const value = Reflect.get(target as object, prop, receiver);
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export type DB = DrizzleDb;
