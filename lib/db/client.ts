/**
 * Database client — the ONLY place Neon-specific code is allowed.
 * All queries elsewhere use Drizzle with standard PostgreSQL SQL.
 * Migration to node-postgres / RDS / Hetzner = change this one file + DATABASE_URL.
 *
 * The connection is created LAZILY (on first query) via a Proxy, so importing this
 * module during `next build` doesn't require DATABASE_URL — only running a query does.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return drizzle(neon(connectionString), { schema });
}

type DrizzleDb = ReturnType<typeof createDb>;
let _db: DrizzleDb | null = null;

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    if (!_db) _db = createDb();
    const value = Reflect.get(_db as object, prop, receiver);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});

export type DB = DrizzleDb;
