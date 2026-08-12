/**
 * Environment loading for scripts (seed, migrate, purge, db:check).
 *
 * Next.js already loads .env.local ahead of .env, but standalone scripts using
 * `dotenv/config` only read .env — which meant `pnpm dev` could be pointed at a
 * local database while `pnpm db:migrate` and `pnpm seed` silently ran against
 * Supabase. That mismatch is how a "local" seed wipes production.
 *
 * dotenv does not overwrite variables that are already set, so loading .env.local
 * FIRST makes it win.
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

/** True when the connection string points at this machine. */
export function isLocalDatabase(url: string | undefined = process.env.DATABASE_URL): boolean {
  if (!url) return false;
  return /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|postgres)[:\/]/i.test(url);
}

/** Redact the password so a connection string can safely be printed. */
export function maskUrl(url: string | undefined): string {
  if (!url) return "(not set)";
  return url.replace(/:\/\/([^:@/]+):[^@]*@/, "://$1:****@");
}

/**
 * Refuse to run a destructive operation against anything but a local database.
 *
 * Set ALLOW_REMOTE_DESTRUCTIVE=1 to override — deliberately awkward, because the
 * only time you should is a considered decision, not a reflex.
 */
export function assertLocalDatabase(operation: string): void {
  if (isLocalDatabase()) return;
  if (process.env.ALLOW_REMOTE_DESTRUCTIVE === "1") {
    console.warn(
      `\n!!  ${operation} is running against a REMOTE database:\n` +
        `    ${maskUrl(process.env.DATABASE_URL)}\n` +
        `    Proceeding because ALLOW_REMOTE_DESTRUCTIVE=1.\n`,
    );
    return;
  }
  console.error(
    `\nREFUSING TO RUN: ${operation} deletes data, and DATABASE_URL is not local.\n\n` +
      `  Target: ${maskUrl(process.env.DATABASE_URL)}\n\n` +
      `  For local development:\n` +
      `    pnpm db:local:up          start the local database\n` +
      `    (.env.local should point DATABASE_URL at 127.0.0.1:5433)\n\n` +
      `  If you really mean to do this to a remote database:\n` +
      `    ALLOW_REMOTE_DESTRUCTIVE=1 pnpm <command>\n`,
  );
  process.exit(1);
}
