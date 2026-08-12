import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations MUST use the direct connection (Supabase port 5432), not the
    // transaction pooler on 6543. DDL and advisory locks do not work through
    // transaction-mode pooling. Falls back to DATABASE_URL for local development,
    // where there is no pooler.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
