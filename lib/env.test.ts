import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkEnv, formatEnvReport } from "./env";

const KEYS = [
  "DATABASE_URL","CLERK_SECRET_KEY","NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "S3_BUCKET","S3_ENDPOINT","S3_ACCESS_KEY_ID","S3_SECRET_ACCESS_KEY",
  "PUBLIC_LEAD_API_KEYS","DIRECT_DATABASE_URL",
];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setRequired() {
  process.env.DATABASE_URL = "postgres://u:p@host:5432/db";
  process.env.CLERK_SECRET_KEY = "sk_test_x";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_x";
}
function setStorage() {
  process.env.S3_BUCKET = "b";
  process.env.S3_ENDPOINT = "https://acct.r2.cloudflarestorage.com";
  process.env.S3_ACCESS_KEY_ID = "id";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
}

describe("checkEnv — required variables", () => {
  it("reports every missing required variable, not just the first", () => {
    const { fatal } = checkEnv();
    const names = fatal.map((f) => f.variable);
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("CLERK_SECRET_KEY");
    expect(names).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });

  it("passes with all required set", () => {
    setRequired(); setStorage();
    process.env.PUBLIC_LEAD_API_KEYS = "k:slug";
    const { fatal } = checkEnv();
    expect(fatal).toEqual([]);
  });

  it("treats an empty string as missing", () => {
    setRequired();
    process.env.DATABASE_URL = "";
    const { fatal } = checkEnv();
    expect(fatal.map((f) => f.variable)).toContain("DATABASE_URL");
  });
});

describe("checkEnv — storage is all-or-nothing", () => {
  it("is FATAL when storage is half configured", () => {
    setRequired();
    process.env.S3_BUCKET = "b";
    process.env.S3_ENDPOINT = "https://x.r2.cloudflarestorage.com";
    // access keys deliberately missing
    const { fatal } = checkEnv();
    const names = fatal.map((f) => f.variable);
    expect(names).toContain("S3_ACCESS_KEY_ID");
    expect(names).toContain("S3_SECRET_ACCESS_KEY");
  });

  it("is only a WARNING when storage is entirely unset", () => {
    setRequired();
    const { fatal, warnings } = checkEnv();
    expect(fatal).toEqual([]);
    expect(warnings.map((w) => w.variable)).toContain("S3_BUCKET");
  });

  it("is silent when storage is fully configured", () => {
    setRequired(); setStorage();
    const { fatal, warnings } = checkEnv();
    expect(fatal).toEqual([]);
    expect(warnings.map((w) => w.variable)).not.toContain("S3_BUCKET");
  });
});

describe("checkEnv — pooler / migrations", () => {
  it("warns when DATABASE_URL is a pooler URL and no direct URL is set", () => {
    setRequired(); setStorage();
    process.env.DATABASE_URL = "postgres://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
    const { warnings } = checkEnv();
    expect(warnings.map((w) => w.variable)).toContain("DIRECT_DATABASE_URL");
  });

  /*
   * The Worker opts out: it never runs DDL, so the warning is advice about something
   * that cannot happen there — and it was printed on every isolate start.
   */
  it("is silent when the caller says migrations do not run here", () => {
    setRequired(); setStorage();
    process.env.DATABASE_URL = "postgres://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
    const { warnings } = checkEnv({ migrations: false });
    expect(warnings.map((w) => w.variable)).not.toContain("DIRECT_DATABASE_URL");
  });

  it("still warns by default, so the CLI keeps the guard", () => {
    setRequired(); setStorage();
    process.env.DATABASE_URL = "postgres://u:p@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";
    expect(checkEnv().warnings.map((w) => w.variable)).toContain("DIRECT_DATABASE_URL");
  });

  it("does not warn when the direct URL is provided", () => {
    setRequired(); setStorage();
    process.env.DATABASE_URL = "postgres://u:p@x.pooler.supabase.com:6543/postgres";
    process.env.DIRECT_DATABASE_URL = "postgres://u:p@db.x.supabase.co:5432/postgres";
    const { warnings } = checkEnv();
    expect(warnings.map((w) => w.variable)).not.toContain("DIRECT_DATABASE_URL");
  });
});

describe("formatEnvReport", () => {
  it("returns an empty string for no problems", () => {
    expect(formatEnvReport([], "head")).toBe("");
  });
  it("names the variable and the impact", () => {
    const out = formatEnvReport(
      [{ variable: "DATABASE_URL", problem: "missing", impact: "nothing works" }],
      "FATAL:",
    );
    expect(out).toContain("DATABASE_URL");
    expect(out).toContain("nothing works");
  });
});

describe("checkEnv — empty strings and placeholders", () => {
  it("treats FOO=\"\" as not configured, not as an invalid value", () => {
    setRequired();
    process.env.S3_ENDPOINT = "";
    const { fatal, warnings } = checkEnv();
    // Must NOT complain about an invalid URL for an empty value.
    expect(fatal.some((f) => f.variable === "S3_ENDPOINT")).toBe(false);
    expect(warnings.some((w) => w.problem.includes("Invalid"))).toBe(false);
  });

  it("flags a placeholder value and does not count it as configured", () => {
    setRequired();
    process.env.S3_ENDPOINT = "https://<accountid>.r2.cloudflarestorage.com";
    process.env.S3_BUCKET = "";
    process.env.S3_ACCESS_KEY_ID = "";
    process.env.S3_SECRET_ACCESS_KEY = "";
    const { fatal, warnings } = checkEnv();
    expect(warnings.some((w) => w.variable === "S3_ENDPOINT" && /placeholder/i.test(w.problem))).toBe(true);
    // A placeholder alone must not trigger "partially configured".
    expect(fatal).toEqual([]);
  });

  it("still catches genuinely partial storage config", () => {
    setRequired();
    process.env.S3_BUCKET = "real-bucket";
    process.env.S3_ENDPOINT = "https://acct.r2.cloudflarestorage.com";
    process.env.S3_ACCESS_KEY_ID = "";
    process.env.S3_SECRET_ACCESS_KEY = "";
    const { fatal } = checkEnv();
    expect(fatal.map((f) => f.variable)).toContain("S3_ACCESS_KEY_ID");
  });

  it("does not warn about a real value", () => {
    setRequired(); setStorage();
    const { warnings } = checkEnv();
    expect(warnings.some((w) => /placeholder/i.test(w.problem))).toBe(false);
  });
});
