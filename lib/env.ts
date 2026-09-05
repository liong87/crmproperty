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
  // Meta (Facebook / Instagram) Lead Ads
  WEBHOOK_SECRET_META: optionalStr,
  META_VERIFY_TOKEN: optionalStr,
  META_PAGE_ACCESS_TOKEN: optionalStr,
  META_GRAPH_VERSION: optionalStr,
  // Migrations only
  DIRECT_DATABASE_URL: optionalStr,

  /**
   * Where production errors are pushed. A Slack or Discord incoming webhook, or any
   * endpoint accepting a JSON POST. Unset means log-only, which is the correct local
   * and build-time behaviour — see lib/monitoring/alert-provider.ts.
   */
  MONITORING_WEBHOOK_URL: optionalUrl,
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
export interface CheckEnvOptions {
  /**
   * Include checks that only matter where MIGRATIONS run — the CLI scripts.
   *
   * Defaults to true so `pnpm db:migrate` and friends keep every guard. The deployed
   * Worker passes false: it never runs DDL, so warning it that "migrations will fail"
   * is advice about something that cannot happen there. It was printed on every
   * isolate start — twice, in practice — which is noise in exactly the log you are
   * reading when something is actually wrong.
   */
  migrations?: boolean;
}

export function checkEnv(options: CheckEnvOptions = {}): { fatal: EnvProblem[]; warnings: EnvProblem[] } {
  const { migrations = true } = options;
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

  /**
   * Meta Lead Ads needs all three or none. Two out of three is the dangerous state:
   * the handshake succeeds, Meta starts delivering, and every paid lead is dropped at
   * a stage nobody is watching. Partial configuration is therefore fatal, matching how
   * object storage is handled above.
   */
  const metaVars = ["WEBHOOK_SECRET_META", "META_VERIFY_TOKEN", "META_PAGE_ACCESS_TOKEN"];
  const metaSet = metaVars.filter(isSet);
  if (metaSet.length > 0 && metaSet.length < metaVars.length) {
    for (const k of metaVars.filter((v) => !isSet(v))) {
      fatal.push({
        variable: k,
        problem: "Partially configured Meta Lead Ads — some variables are set but not this one.",
        impact:
          k === "META_PAGE_ACCESS_TOKEN"
            ? "Meta will deliver leads and every one will be dropped: the lead data cannot be fetched."
            : k === "WEBHOOK_SECRET_META"
              ? "Every Meta delivery will be rejected as unsigned."
              : "Meta cannot complete the subscription handshake, so no leads will arrive.",
      });
    }
  }

  if (migrations && !isSet("DIRECT_DATABASE_URL") && /:6543\//.test(process.env.DATABASE_URL ?? "")) {
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
