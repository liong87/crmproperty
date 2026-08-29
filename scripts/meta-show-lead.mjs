#!/usr/bin/env node
/** Print the raw field_data Meta holds for a lead. node scripts/meta-show-lead.mjs <lead_id> */
import { readFileSync } from "node:fs";
const die=(m)=>{console.error(`\n  ✗ ${m}\n`);process.exit(1)};
const env={};for(const l of readFileSync(".env","utf8").split(/\r?\n/)){const m=/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l);if(!m)continue;let v=m[2].trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);env[m[1]]=v;}
const token=env.META_PAGE_ACCESS_TOKEN||die("no token");
const version=env.META_GRAPH_VERSION||"v21.0";
const id=process.argv[2]||die("usage: node scripts/meta-show-lead.mjs <lead_id>");
const u=new URL(`https://graph.facebook.com/${version}/${id}`);
u.searchParams.set("fields","id,created_time,form_id,ad_id,campaign_name,field_data");
u.searchParams.set("access_token",token);
const r=await fetch(u,{headers:{accept:"application/json"}});
const j=await r.json();
if(!r.ok||j.error) die(`Graph ${r.status}: ${j.error?.message??JSON.stringify(j)}`);
console.log(`\n  lead ${j.id}   form ${j.form_id ?? "—"}   ${j.created_time}\n`);
for(const f of j.field_data??[]) console.log(`  ${String(f.name).padEnd(24)} ${JSON.stringify(f.values)}`);
console.log("");
