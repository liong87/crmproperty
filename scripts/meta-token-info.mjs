#!/usr/bin/env node
/**
 * Introspect META_PAGE_ACCESS_TOKEN: what is it, who owns it, what can it do, when
 * does it die. Answers the questions that otherwise turn into guesswork when the
 * Graph API says "requires <permission>".
 *
 *   node scripts/meta-token-info.mjs
 *
 * Uses an app token (APP_ID|APP_SECRET) to call /debug_token, so it needs
 * META_APP_ID (or falls back to the id below) and WEBHOOK_SECRET_META.
 */
import { readFileSync } from "node:fs";

const die = (m) => { console.error(`\n  ✗ ${m}\n`); process.exit(1); };

function loadEnv(path = ".env") {
  const out = {};
  let text;
  try { text = readFileSync(path, "utf8"); } catch { die(`Cannot read ${path}`); }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = loadEnv();
const token = env.META_PAGE_ACCESS_TOKEN || die("META_PAGE_ACCESS_TOKEN not set");
const secret = env.WEBHOOK_SECRET_META || die("WEBHOOK_SECRET_META not set (this is the App Secret)");
const appId = env.META_APP_ID || "3056637414682639";
const version = env.META_GRAPH_VERSION || "v21.0";

const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
url.searchParams.set("input_token", token);
url.searchParams.set("access_token", `${appId}|${secret}`);

const res = await fetch(url, { headers: { accept: "application/json" } });
const json = await res.json().catch(() => ({}));

if (!res.ok || json.error) {
  const e = json.error ?? {};
  console.error(`\n  ✗ debug_token failed: ${e.message ?? JSON.stringify(json)}`);
  if (e.code === 190 || /app secret/i.test(e.message ?? "")) {
    console.error("    WEBHOOK_SECRET_META may not be the App Secret, or META_APP_ID is wrong.");
  }
  console.error("");
  process.exit(1);
}

const d = json.data ?? {};
const when = (s) => (!s ? "never" : new Date(s * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC");

console.log("");
console.log(`  Type        ${d.type ?? "?"}`);
console.log(`  App         ${d.application ?? "?"} (${d.app_id ?? "?"})`);
console.log(`  Owner       ${d.user_id ?? d.profile_id ?? "—"}`);
console.log(`  Valid       ${d.is_valid ? "yes" : "NO"}`);
console.log(`  Expires     ${when(d.expires_at)}`);
console.log(`  Data expiry ${when(d.data_access_expires_at)}`);

const scopes = d.scopes ?? [];
console.log(`\n  Scopes (${scopes.length})`);
for (const s of scopes.sort()) console.log(`    ${s}`);

const need = ["leads_retrieval", "pages_manage_ads", "pages_show_list", "pages_read_engagement"];
const missing = need.filter((n) => !scopes.includes(n));
console.log("\n  Required for lead ingestion:");
for (const n of need) console.log(`    ${scopes.includes(n) ? "✓" : "✗"} ${n}`);

if (d.granular_scopes?.length) {
  console.log("\n  Granular scopes (which assets each applies to)");
  for (const g of d.granular_scopes) {
    console.log(`    ${g.scope}: ${(g.target_ids ?? ["<all>"]).join(", ")}`);
  }
}

console.log(
  missing.length === 0
    ? "\n  ✓ Token has everything needed.\n"
    : `\n  ✗ Missing: ${missing.join(", ")} — regenerate the system-user token with these ticked.\n`,
);
