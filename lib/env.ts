/**
 * Environment validation.
 *
 * The problem this solves: configuration used to fail at the moment of first use,
 * not at deploy. `lib/storage/r2-provider.ts` read `S3_BUCKET!` at module scope with
 * a non-null assertion, so an unset value built an S3 client with undefined
 * credentials and the first image upload died with an opaque AWS SDK error. Likewise
 * a missing DATABASE_URL surfaced as a 500 on a user's first request.
 *
 * Now every variable is described once, validated once at server start
 * (see instrumentation.ts), and a bad deploy fails loudly with a list of exactly
 * what is missing.
 *
 * Validation is deliberately NOT done at import time: `next build` runs without
 * real secrets and must keep working.
 */
import { z } from "zod";

const nonEmpty = z.string().min(1);

/**
 * Values that look configured but are not. A placeholder is more dangerous than an
 * empty value: it passes a "is it set?" check and then fails at runtime, which is
 * exactly how `S3_ENDPOINT="https://<accountid>.r2.cloudflarestorage.com"` would
 * have reached production looking fine.
 */
const PLACEHOLDER = /(^$)|(<[^>]*>)|(YOUR[-_])|(\[YOUR)|(xxx+)|(changeme)|(accountid)/i;

/** Is this variable meaningfully set? Empty and placeholder values are NOT. */
function isSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" && !PLACEHOLDER.test(v.trim());
}

/** Treat empty strings as absent, so `FOO=""` means "not configured". */
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().url().optional(),
);
const optionalStr = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

/** Required for the app to function at all. */
const requiredSchema = z.object({
  DATABASE_URL: nonEmpty.describe("PostgreSQL connection string (Supabase pooler, port 6543)"),
  CLERK_SECRET_KEY: nonEmpty.describe("Clerk server key"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: nonEmpty.describe("Clerk browser key"),
});

/** Required only for the features that use them. Grouped so errors are actionable. */
const featureSchema = z.object({
  // Property photographs
  S3_BUCKET: optionalStr,
  S3_ENDPOINT: optionalUrl,
  S3_ACCESS_KEY_ID: optionalStr,
  S3_SECRET_ACCESS_KEY: optionalStr,
  S3_REGION: optionalStr,
  // Lead capture
  PUBLIC_LEAD_API_KEYS: optionalStr,
  PUBLIC_LEAD_ALLOWED_ORIGINS: optionalStr,
  // Email
  RESEND_API_KEY: optionalStr,
  EMAIL_FROM: optionalStr,
  // Migrations only
  DIRECT_DATABASE_URL: optionalStr,
});

export interface EnvProblem {
  variable: string;
  problem: string;
  /** What breaks if this stays unset. */
  impact: string;
}

/**
 * Check the environment. Returns problems rather than throwing, so the caller
 * decides whether to refuse to start (production) or warn (development).
 */
export function checkEnv(): { fatal: EnvProblem[]; warnings: EnvProblem[] } {
  const fatal: EnvProblem[] = [];
  const warnings: EnvProblem[] = [];

  const required = requiredSchema.safeParse(process.env);
  if (!required.success) {
    for (const issue of required.error.issues) {
      const variable = String(issue.path[0]);
      fatal.push({
        variable,
        problem: issue.message,
        impact: "The application cannot serve any authenticated page without this.",
      });
    }
  }

  const features = featureSchema.safeParse(process.env);
  if (!features.success) {
    for (const issue of features.error.issues) {
      warnings.push({
        variable: String(issue.path[0]),
        problem: issue.message,
        impact: "Malformed value — the feature using it will fail at runtime.",
      });
    }
  }

  // Flag placeholders explicitly. They are the worst case: they look configured.
  for (const k of Object.keys({ ...requiredSchema.shape, ...featureSchema.shape })) {
    const raw = process.env[k];
    if (typeof raw === "string" && raw.trim() !== "" && PLACEHOLDER.test(raw.trim())) {
      warnings.push({
        variable: k,
        problem: "Still set to an example/placeholder value.",
        impact: "Treated as not configured. Replace it or blank it.",
      });
    }
  }

  // Storage is all-or-nothing: a partial configuration is worse than none, because
  // it fails only when an agent tries to upload a photograph.
  const s3Keys = ["S3_BUCKET", "S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
  const s3Set = s3Keys.filter((k) => isSet(k));
  if (s3Set.length > 0 && s3Set.length < s3Keys.length) {
    for (const k of s3Keys.filter((k) => !s3Set.includes(k))) {
      fatal.push({
        variable: k,
        problem: "Partially configured storage — some S3/R2 variables are set but not this one.",
        impact: "Property photo upload and display will fail.",
      });
    }
  }

  // Warn rather than fail: the app runs fine, agents just cannot attach photographs.
  if (s3Set.length === 0) {
    warnings.push({
      variable: "S3_BUCKET",
      problem: "Object storage is not configured.",
      impact: "Property photographs cannot be uploaded or viewed.",
    });
  }

  if (!isSet("PUBLIC_LEAD_API_KEYS")) {
    warnings.push({
      variable: "PUBLIC_LEAD_API_KEYS",
      problem: "No landing-page API keys configured.",
      impact: "The public lead endpoint will reject every submission.",
    });
  }

  if (!isSet("DIRECT_DATABASE_URL") && /:6543\//.test(process.env.DATABASE_URL ?? "")) {
    warnings.push({
      variable: "DIRECT_DATABASE_URL",
      problem: "DATABASE_URL points at a connection pooler and no direct URL is set.",
      impact: "Database migrations will fail — DDL does not work through transaction pooling.",
    });
  }

  return { fatal, warnings };
}

/** Human-readable report for the server log. */
export function formatEnvReport(problems: EnvProblem[], heading: string): string {
  if (problems.length === 0) return "";
  const lines = problems.map((p) => `  • ${p.variable}: ${p.problem}\n      → ${p.impact}`);
  return `${heading}\n${lines.join("\n")}`;
}
