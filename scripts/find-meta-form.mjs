#!/usr/bin/env node
/**
 * Identify which of a pile of Meta ids is a Lead Ads form.
 *
 * The Lead Ads Testing Tool renders its dropdowns as React components, so the form id
 * cannot be read out of the DOM as an <option value>. Scraping every long number off
 * the page gives ~35 candidates; this asks the Graph API which one is actually a form.
 *
 *   node scripts/find-meta-form.mjs [file]     # default scripts/meta-candidates.txt
 *
 * A leadgen form answers with a name and leads_count. Everything else errors, which is
 * the signal we want — we are probing, not fetching.
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
let token = env.META_PAGE_ACCESS_TOKEN || die("META_PAGE_ACCESS_TOKEN not set");
const version = env.META_GRAPH_VERSION || "v21.0";

async function get(path, params = {}, tok = token) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", tok);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  return { ok: res.ok, body: await res.json().catch(() => ({})) };
}

// Prefer a Page token: form metadata is Page-scoped.
const accounts = await get("me/accounts", { fields: "id,name,access_token", limit: "50" });
if (accounts.ok && accounts.body?.data?.length) {
  const pageId = env.META_PAGE_ID;
  const picked = pageId ? accounts.body.data.find((r) => r.id === pageId) : accounts.body.data[0];
  if (picked?.access_token) {
    token = picked.access_token;
    console.log(`  Using Page token for ${picked.name} (${picked.id})`);
  }
}

const file = process.argv[2] || "scripts/meta-candidates.txt";
const ids = readFileSync(file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
console.log(`  Probing ${ids.length} candidate ids...\n`);

const hits = [];
for (const id of ids) {
  const r = await get(id, { fields: "id,name,status,leads_count,created_time" });
  if (r.ok && r.body?.name !== undefined && r.body?.leads_count !== undefined) {
    hits.push(r.body);
    console.log(`  ✓ FORM  ${id}  "${r.body.name}"  status=${r.body.status ?? "?"}  leads=${r.body.leads_count}`);
  }
}

if (hits.length === 0) {
  console.log("  No lead forms among the candidates.");
  console.log("  Either the id was not on the page, or the token cannot read form metadata.\n");
  process.exit(1);
}

console.log(`\n  Found ${hits.length} form(s). Replay the newest lead with:\n`);
for (const h of hits) console.log(`    node scripts/replay-meta-lead.mjs --form ${h.id}\n`);
