#!/usr/bin/env node
/**
 * Replay a real Meta Lead Ads lead at our own webhook, exactly as Meta would.
 *
 * Meta's realtime delivery to a dev tunnel is unreliable (unpublished apps, queued
 * "Pending" updates that never arrive). This bypasses delivery ONLY — everything
 * downstream is the real path: real signature, real Graph API fetch, real intake.
 *
 *   node scripts/replay-meta-lead.mjs                  # newest lead on the Page
 *   node scripts/replay-meta-lead.mjs <leadgen_id>     # a specific one
 *   node scripts/replay-meta-lead.mjs --form <form_id> # newest lead on one form
 *   node scripts/replay-meta-lead.mjs --list           # show forms + leads, send nothing
 *
 * Listing forms needs pages_manage_ads on the token. Fetching a lead needs only
 * leads_retrieval, so --form and <leadgen_id> work on a leads-only token.
 *
 * Env comes from .env: META_PAGE_ACCESS_TOKEN, WEBHOOK_SECRET_META.
 * Override the target with TARGET=https://... (defaults to local dev).
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const TARGET = process.env.TARGET || "http://127.0.0.1:3000/api/webhooks/forms/meta";

function loadEnv(path = ".env") {
  const out = {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    die(`Cannot read ${path} — run this from the project root.`);
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    // Strip matching surrounding quotes — the same thing dotenv does.
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const die = (msg) => {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
};

async function graph(version, path, token, params = {}, soft = false) {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body?.error ?? {};
    if (soft) return { __error: e };
    if (e.code === 200 && /leadgen_forms/.test(path)) {
      die(
        `Graph API 403: ${e.message}\n` +
        `    Listing forms needs pages_manage_ads on META_PAGE_ACCESS_TOKEN.\n` +
        `    Skip it: pass a form id with --form <id>, or a lead id directly.`,
      );
    }
    die(`Graph API ${res.status} on /${path}: ${e.message ?? JSON.stringify(body)}`);
  }
  return body;
}

const env = loadEnv();
let token = env.META_PAGE_ACCESS_TOKEN || die("META_PAGE_ACCESS_TOKEN not set in .env");
const secret = env.WEBHOOK_SECRET_META || die("WEBHOOK_SECRET_META not set in .env");
const version = env.META_GRAPH_VERSION || "v21.0";

const argv = process.argv.slice(2);
const listOnly = argv.includes("--list");
const formFlag = argv.indexOf("--form");
const explicitForm = formFlag !== -1 ? argv[formFlag + 1] : null;
if (formFlag !== -1 && !explicitForm) die("--form needs a form id.");
// Skip the value that belongs to --form, or a form id is mistaken for a lead id.
const consumed = formFlag !== -1 ? formFlag + 1 : -1;
const explicitId = argv.find((a, i) => i !== consumed && /^\d+$/.test(a)) ?? null;

// The token may be a PAGE token (/me is the Page) or a SYSTEM USER / user token
// (/me is the actor, and Page tokens are minted from /me/accounts). Handle both, and
// keep using a real Page token downstream — lead retrieval needs one.
const me = await graph(version, "me", token, { fields: "id,name" });

const wantPageId = env.META_PAGE_ID || null;
let page = null;
let pageToken = token;

const accounts = await graph(
  version,
  "me/accounts",
  token,
  { fields: "id,name,access_token", limit: "50" },
  true,
);

if (Array.isArray(accounts?.data) && accounts.data.length > 0) {
  const rows = accounts.data;
  const picked = wantPageId ? rows.find((r) => r.id === wantPageId) : rows[0];
  if (!picked) {
    console.log("  Pages available to this token:");
    for (const r of rows) console.log(`    ${r.name} (${r.id})`);
    die(`META_PAGE_ID=${wantPageId} is not among them.`);
  }
  if (rows.length > 1 && !wantPageId) {
    console.log("  Note   several Pages available; set META_PAGE_ID in .env to pin one.");
    for (const r of rows) console.log(`         ${r.name} (${r.id})`);
  }
  page = { id: picked.id, name: picked.name };
  if (picked.access_token) {
    pageToken = picked.access_token;
    console.log(`\n  Actor  ${me.name} (${me.id})`);
    console.log(`  Page   ${page.name} (${page.id})  — minted a Page token`);
  } else {
    console.log(`\n  Page   ${page.name} (${page.id})  — no Page token returned, using the actor token`);
  }
} else {
  // No /me/accounts: this is most likely already a Page token.
  page = { id: wantPageId ?? me.id, name: me.name };
  console.log(`\n  Page   ${page.name} (${page.id})`);
  if (accounts?.__error) {
    console.log(`         (/me/accounts unavailable: ${accounts.__error.message ?? "unknown"})`);
  }
}

// Everything below talks to the Page, so use the Page token.
token = pageToken;

let leadgenId = explicitId;
let formId = null;

if (!leadgenId && explicitForm) {
  // Straight to one form's leads — no pages_manage_ads needed.
  const leads = await graph(version, `${explicitForm}/leads`, token, {
    fields: "id,created_time",
    limit: "10",
  });
  const rows = leads.data ?? [];
  if (rows.length === 0) die(`Form ${explicitForm} has no leads. Create one in the testing tool first.`);
  for (const l of rows) console.log(`  lead   ${l.id}  ${l.created_time}`);
  leadgenId = rows[0].id;
  formId = explicitForm;
  console.log(`\n  Using newest lead ${leadgenId}`);
} else if (!leadgenId || listOnly) {
  const forms = await graph(version, `${page.id}/leadgen_forms`, token, {
    fields: "id,name,status,leads_count",
    limit: "25",
  });
  const list = forms.data ?? [];
  if (list.length === 0) die("No lead forms on this Page.");

  let newest = null;
  for (const f of list) {
    console.log(`\n  Form   ${f.name}`);
    console.log(`         id ${f.id}   status ${f.status ?? "?"}   leads ${f.leads_count ?? 0}`);
    const leads = await graph(version, `${f.id}/leads`, token, {
      fields: "id,created_time",
      limit: "5",
    });
    for (const l of leads.data ?? []) {
      console.log(`         lead ${l.id}  ${l.created_time}`);
      const t = Date.parse(l.created_time || 0) || 0;
      if (!newest || t > newest.t) newest = { t, id: l.id, formId: f.id };
    }
    if ((leads.data ?? []).length === 0) console.log("         (no leads)");
  }

  if (listOnly) {
    console.log("\n  --list only, nothing sent.\n");
    process.exit(0);
  }
  if (!newest) die("No leads found. Create one in the Lead Ads Testing Tool first.");
  leadgenId = newest.id;
  formId = newest.formId;
  console.log(`\n  Using newest lead ${leadgenId}`);
}

// The envelope Meta actually posts: a receipt, not the lead itself.
const body = {
  object: "page",
  entry: [
    {
      id: page.id,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: leadgenId,
            page_id: page.id,
            form_id: formId ?? undefined,
            created_time: Math.floor(Date.now() / 1000),
          },
        },
      ],
    },
  ],
};

const raw = JSON.stringify(body);
// Meta signs the raw bytes with the APP SECRET, hex, prefixed sha256=.
const signature = "sha256=" + createHmac("sha256", secret).update(raw, "utf8").digest("hex");

console.log(`  POST   ${TARGET}`);

let res;
try {
  res = await fetch(TARGET, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
      "user-agent": "facebookplatform/1.0 (+http://developers.facebook.com)",
    },
    body: raw,
  });
} catch (err) {
  die(`Could not reach ${TARGET} — is \`pnpm dev\` running? (${err.message})`);
}

const text = await res.text();
console.log(`\n  ${res.status} ${res.statusText}`);
console.log(`  ${text}\n`);

if (res.status === 200) {
  console.log(`  ✓ Accepted. Check ${new URL(TARGET).origin}/leads\n`);
} else if (res.status === 403) {
  console.log("  ✗ Signature rejected — WEBHOOK_SECRET_META is not the App Secret.\n");
} else if (res.status === 503) {
  console.log("  ✗ Graph API fetch failed — usually an expired META_PAGE_ACCESS_TOKEN.\n");
}
