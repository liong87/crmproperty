/**
 * Database client — the ONLY place Neon-specific code is allowed.
 * All queries elsewhere use Drizzle with standard PostgreSQL SQL.
 * Migration to node-postgres / RDS / Hetzner = change this one file + DATABASE_URL.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(connectionString);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
