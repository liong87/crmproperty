# PropertyAgent CRM — Revamp Spec (benchmarked against ZIEN CRM)

**Target project:** `C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm`
**Live:** https://propertyagent-crm.lanthornrealty.workers.dev/ (Cloudflare Workers)
**Benchmark:** https://ziencrm.com — toured 2 Sep 2026 (Dashboard, Working Leads, Master Leads, Appointment, Leads Capture, Report, WhatsApp Bot, Learning Hub)

This is a build-ready spec. Hand it to Claude Code in the project folder and work phase by phase.

---

## 1. What ZIEN actually is

Not a generic CRM. It is a **lead-factory CRM for commission agents**, built around one loop:

```
Ad / campaign → Master Leads (the database)
              → assigned or grabbed → Working Leads (the daily queue)
              → booked → Appointment Board (kanban to close)
              → Report (funnel conversion per product/campaign)
```

Three ideas carry the whole product, and they are what your CRM is missing:

1. **Two lead surfaces, not one.** *Master Leads* = every lead you own (database view, table, admin). *Working Leads* = only leads assigned to you right now (queue view, cards, action). Same rows, different jobs. Never merge them.
2. **Follow-up rate as the primary KPI.** Every screen shows `x/y followed up · N%`. The product nags you to touch leads, not to admire them.
3. **Everything is configurable per workspace, not hardcoded.** Products, Sources (with sub-levels), Statuses, Sequences, Collab Pool rules, Display density, WhatsApp message template — all live in one `Configuration` modal reachable from each screen.

---

## 2. Navigation (target IA)

Left icon rail, 8 destinations. Adopt this exactly; it is a good IA.

| Route | Screen | Purpose |
|---|---|---|
| `/dashboard` | Dashboard | Funnel + follow-up rate, last-7-days default |
| `/working-leads` | Working Leads | My queue: Active / Inactive / Appointment |
| `/appointment` | Appointment Board | Kanban to close + Calendar |
| `/master-leads` | Master Leads | Full lead database, table, add/import |
| `/leads-capture` | Leads Capture | Facebook forms + WhatsApp keyword ingestion |
| `/report` | Report | Product funnel, campaign analytics, collaborator scorecard |
| `/whatsapp` | WhatsApp Bot | Flows, broadcasts, run log, accounts |
| `/learning-hub` | Learning Hub | Video/topic library, uploads, sharing |

Header pattern on every screen: big title, a **single big number + one-line subtitle** ("1 ongoing apt waiting to be closed"), then a segmented tab row with counts, then a filter-chip row, then content.

---

## 3. Data model

Assume Cloudflare D1 (SQLite). Adjust names to your existing schema; keep the shape.

```sql
-- Tenancy
workspace(id, name, owner_user_id, created_at)
user(id, workspace_id, name, email, phone, avatar_url, role, upline_user_id, created_at)
  -- role: owner | admin | agent

-- Configuration (all workspace-scoped, all user-editable)
product(id, workspace_id, name, color, sort_order, archived_at)
source(id, workspace_id, parent_id, name, kind, icon, sort_order)
  -- kind: main | sub.  Meta → Campaign → Adset → Ads (3 sub levels)
  -- seed mains: Meta, Google SEO, YouTube, Roadshow, Red Note, Walk-in, Referral
lead_status(id, workspace_id, name, color, stage_group, sort_order)
  -- stage_group: new | working | appointment | closed | dead

-- Core
lead(
  id, workspace_id, full_name, phone_e164, wa_username, email,
  product_id, source_id, sub_source_id, campaign, adset, ad,
  status_id, info,                    -- info = freeform "budget, preferences, notes from form"
  owner_user_id,                      -- current collaborator working it
  created_at, updated_at,
  last_followup_at, followup_count,   -- drives the ↻ 1× column
  recycle_count,                      -- times returned to pool / reassigned
  dormant_days,                       -- the "D" column: days since last touch
  is_active,                          -- Active vs Inactive tab
  in_pool, pool_released_at,
  dedupe_key                          -- normalized phone; unique per workspace
)

lead_assignment(id, lead_id, user_id, assigned_by, assigned_at, released_at, order_index)
lead_activity(id, lead_id, user_id, type, body, meta_json, created_at)
  -- type: created | assigned | status_change | followup | note | wa_sent | appt_set | stage_move

appointment(
  id, workspace_id, lead_id, product_id,
  scheduled_at, location, stage,        -- see §6
  closer_user_id, setter_user_id,
  outcome, loan_amount, closed_at, notes,
  created_at, updated_at
)

-- Automation
sequence_rule(id, workspace_id, name, priority, match_json, steps_json, enabled)
  -- match_json: {product_id, source_id, status_id}
  -- steps_json: [{user_id, hold_minutes}] — hand lead down the line if untouched
pool_rule(id, workspace_id, name, priority, match_json, max_per_grab, min_followup_pct, enabled)
capture_integration(id, workspace_id, kind, external_id, name, connected_at, enabled)
  -- kind: facebook_page | facebook_form | whatsapp_account
capture_route(id, workspace_id, integration_id, match_json, product_id, source_id, assign_to)
wa_flow(id, workspace_id, name, trigger_keywords_json, graph_json, enabled)
wa_broadcast(id, workspace_id, flow_id, audience_json, pacing_json, status, stats_json)
wa_run(id, workspace_id, lead_id, flow_id, trigger, status, started_at, finished_at, log_json)

-- Learning
topic(id, workspace_id, title, description, media_url, media_type, uploaded_by, visibility, created_at)
topic_view(id, topic_id, user_id, watched_seconds, completed_at)
```

**Indexes that matter:** `lead(workspace_id, owner_user_id, is_active)`, `lead(workspace_id, dedupe_key)` unique, `lead(workspace_id, last_followup_at)`, `appointment(workspace_id, stage, scheduled_at)`.

---

## 4. Working Leads — the daily queue

**Header:** `Working Leads` / `{n} active leads to work on`

**Tabs:** `Active {n}` · `Inactive {n}` · `Appointment {n}`
- Active = assigned to me, not yet dead, no appointment booked
- Inactive = assigned to me but marked cold / no response / snoozed
- Appointment = has an open appointment (mirrors the board)

**Right of tabs:** search box (`name, phone, email, remarks…`), a **follow-up pill** `↗ 3/8 followed up 38%` that opens a weekly follow-up graph, and `⚙ Configuration`. Primary CTA: **`+ Collab Pool`**.

**Filter chips:** Product · Status · Collaborator · WhatsApp.

**Lead card** (not a table row here) shows: name, phone as a **tap-to-WhatsApp link**, product chip, status chip, source, last-touch relative time, dormant-days badge, avatar of collaborator. Actions inline: change status, log follow-up, book appointment, add note, release to pool.

**Empty state copy** (steal it, it teaches the model): *"No active leads yet — Leads land here when someone assigns them to you, or when you take one from the Collab Pool."*

**Follow-up rule:** a lead counts as "followed up" for the period if `last_followup_at` falls in the selected window. The percentage is `followed / total assigned`. Compute server-side and cache per user per day.

---

## 5. Master Leads — the database

**Header:** `Master Leads` / `{n} leads in your database`. Buttons: `⚙ Configuration`, `+ Add Lead`.

**Filter chips:** Source · Product · Status · Progress · Collaborator.

**Table columns (sortable):**
`LEAD` (name + phone) · `SOURCE` (main + sub, e.g. Meta / met1) · `INFO` · `PRODUCT` · `STATUS` (colored chip) · `DATE` (created, `02 Sept / 09:51 am`) · `↻` (recycle count, `↻ 1×`) · `D` (dormant days, `0d`) · `COLLABORATORS` (stacked avatar chips with `#1` sequence position, name, relative time, current status).

Row hover reveals ✎ edit and 🗑 delete. Checkbox column for bulk actions (bulk assign, bulk status, bulk release to pool, bulk delete).

**Add Lead modal:** two modes — `Single` and `Bulk Import`.
Single fields: Full name*, Contact number / WhatsApp username* (`60123456789 or @username`), Email (optional), Product (select), Source (cascading select: main → campaign → adset → ad), Lead Info (textarea: "Budget, preferences, notes from form…").
Bulk Import: CSV upload → column mapper → dedupe preview by normalized phone → import.

**Phone normalization:** strip spaces/dashes, drop leading `0`, prefix `60` for MY numbers. Store E.164 without `+`. Dedupe on this.

---

## 6. Appointment Board — the closer's kanban

**Header:** `Appointment Board` / `{n} ongoing apt waiting to be closed`
**Tabs:** `Ongoing Apt {n}` · `Completed Apt {n}` · `Calendar {n}`
**Filter chips:** Product · Role · Control · WhatsApp. Plus the same search + follow-up pill + Configuration.

**Columns (horizontal scroll, drag-and-drop between them):**

```
APPOINTMENT → NO SHOW → SHOW UP → CLOSED → LOAN SUBMITTED → CONVERTED
                                                  ↘ NOT INTERESTED
                                                  ↘ CANCELLED
```

Each column header shows name, a collapse caret, and a count. Empty columns render a soft `Empty` placeholder — keep it, it makes the board readable when sparse.

**Appointment card:** product chip + `@` location + **when** (`Tomorrow · 08:00 am`) in a colored banner; then lead name + phone (WhatsApp link); then `CLOSER` with avatar; then a footer chip `Today · 10:25 am  for appointment` (last activity).

**Role model:** `SETTER` (booked it) and `CLOSER` (runs it) can be different users — this is how team commission splits work. Show both when they differ.

**Calendar tab:** month/week view of `scheduled_at`, click a day to see that day's appointments.

For property specifically, extend the stages: after `SHOW UP` add optional `BOOKING FEE` and rename `LOAN SUBMITTED` → `LOAN SUBMITTED` (keep — mortgage stage is exactly right for MY property), then `CONVERTED` = SPA signed. Make stage names editable in Configuration so you can tune later.

---

## 7. Dashboard

Two cards side by side, both with a period selector (`Last 7 days` default; 30 days, 90 days, All time).

**Your funnel** — toggle `Leads you work` / `Leads you own`, plus a `PRODUCT: All products` select. Renders the same 5-step funnel as Report.

**Your follow-up rate** — segmented: `Active` / `Inactive` / `Ongoing Apt` / `Completed Apt`, with a `Working Leads →` shortcut button.

Greeting line: `Good afternoon, {first_name}` / `Here's how your leads are moving.` Time-of-day aware.

Loading states are explicit and human ("Counting…", "Working out your follow-ups") — do the same rather than skeleton grey blocks.

---

## 8. Report

**Tabs:** `Lead` · `Campaign`.

**Product Funnel** (Lead tab): filter by date range + source. One funnel per product, click a product to expand its status breakdown. Five stages with both a percentage and a `x of y` count, plus a **step conversion** arrow underneath (`→ 100%`):

```
LEAD → APPT → SHOW UP → CLOSED → CONV
```

Metrics: `appt_rate = appts / leads`, `show_rate = show_ups / appts`, `close_rate = closed / show_ups`, `conv_rate = converted / leads`. Show both step-conversion and overall.

**Campaign tab:** same funnel sliced by source → campaign → adset → ad, with cost fields if you later import ad spend (add `campaign_spend` table → CPL, CPA, cost per conversion). This is the highest-value addition for a property agency buying Meta leads.

**Sequence Overview:** how many leads each sequence rule touched, pass-down count, time-to-first-touch.

**Collab Pool:** `{n}/{m} rules active · {k} grabs`.

**Collaborators table:** per collaborator — Assigned, Active, Ongoing Apt, Updated Today (`1/1 (100%)`), Inactive, Completed Apt, with a `View` drill-down.

---

## 9. Leads Capture

Three-column layout: **Facebook Form** | **WhatsApp** | **Accounts sidebar**.

- **Facebook Form:** list of connected lead forms with a per-form enable toggle and a `Product Routing` rule builder ("No rules yet, click to configure"). Rules map `page + form + field value → product + source + assignee`.
- **WhatsApp:** capture leads from trigger words in incoming messages. `Username Capture` toggle: when off, messages with no phone number are skipped.
- **Accounts sidebar:** Facebook Accounts (connected pages, per-page form count, resync icon) and WhatsApp Accounts (`0 of 3 accounts`, plan-limited).

**Implementation on Workers:** register a webhook endpoint `/api/webhooks/facebook/leadgen`, verify `hub.verify_token`, fetch the leadgen record with the page token, map fields, dedupe, insert, then run sequence rules. Store page tokens encrypted in a `secret` table or Workers Secrets, never in D1 plaintext.

---

## 10. WhatsApp Bot

Sections: **Flow** (automated sequences, keyword/trigger builder) · **Broadcast** (pick audience from working leads or upload a list, choose flow, safe pacing) · **Log** (table: LEAD, FLOW, TRIGGER, STATUS, TIME) · **Accounts** (`0 of 3`) · **Storage** (10 GB media limit) · **Bandwidth** (unlimited).

Copy the disclaimer verbatim in spirit — it is legally useful: *automation carries ban risk, warm up new numbers, keep conversations human.*

Build order: log first → single-message send → keyword auto-reply → multi-step flow → broadcast with pacing (randomized 30–90s gaps, daily cap, quiet hours).

---

## 11. Learning Hub

`{n} learning topics available`, tabs `Library` / `My Uploads`. Upload video/PDF topics, share to downline/collaborators. Empty state: *"Topics you upload, and topics your upline or collaborators share, show up here ready to watch."*

Low priority — ship last, but it is what makes agency owners pay, because it is the recruiting/training hook.

---

## 12. Configuration modal (shared component)

One modal, opened from Working Leads, Master Leads and Appointment. Tabs:

1. **Products** — add/rename/color/merge/delete. Banner: *"Products are shared across your workspace. Any changes here (adding, deleting, or merging) will also affect Working Leads and Appointment."*
2. **Sources** — QUICK ADD chips (Meta, Roadshow, Red Note, YouTube, Google SEO) with a ✓ when already added; `+ Add main source`; each main expands to editable sub-levels (Meta → Campaign / Adset / Ads; Google SEO → Domain; YouTube → Video).
3. **Sequences** — *"a lead is handed to collaborators one after another; if a collaborator doesn't work it in time, it passes to the next. Rules fire top-to-bottom and the first matching rule wins."* Rule editor: match (product/source/status) → ordered list of collaborators with a hold time each.
4. **Collab Pool** — *"a shared bucket of your leads that collaborators can pull from themselves, on demand. Each pool rule controls which leads collaborators can grab. A lead matching multiple rules appears once, so agents grab it only once."* Global `Pool access limits`: minimum follow-up rate to grab (e.g. 70%) and max leads per grab (e.g. 30).
5. **Display** — font size S / M / L / XL with a live hint ("Medium: balanced spacing"). Persist per user.
6. **WhatsApp Link** — a saved message template. Any lead number rendered anywhere becomes a `wa.me/{phone}?text={template}` link with the message pre-typed but **not** sent. Preview shows the composed chat bubble. Footer: *"Saved for your account and used on every screen."*

---

## 13. Visual language

- Light, airy, near-white background with a very faint grid; white cards, ~16px radius, soft shadow.
- One strong accent blue (`#2563EB`-ish) for primary actions and the active nav pill; green for WhatsApp affordances.
- Status/stage colors are semantic and reused everywhere: Appointment amber, No Show red, Show Up orange, Closed green, Converted deep green, Not Interested / Cancelled grey.
- Left icon-only rail (~64px) that expands on click; avatar pinned bottom.
- Type: one geometric sans, tight tracking on the H1, generous whitespace, small uppercase table headers with letter-spacing.
- Mobile: rail becomes bottom tab bar; tables become cards; the Appointment board scrolls horizontally with snap.

---

## 14. Gap list — what to build in your CRM

Ordered by leverage. Each is a checkable milestone.

**Phase 1 — foundation (must)**
- [ ] Workspace + user roles (owner/admin/agent) + upline relationship
- [ ] Configuration modal with Products, Sources (nested), Statuses, Display
- [ ] Master Leads table with the 9 columns, sortable, filter chips, bulk select
- [ ] Add Lead (single) + Bulk CSV import with phone normalization and dedupe
- [ ] Working Leads queue with Active/Inactive/Appointment tabs and lead cards
- [ ] `lead_activity` timeline + explicit "log follow-up" action
- [ ] Follow-up rate computation and the `x/y · N%` pill on every screen

**Phase 2 — the closing loop**
- [ ] Appointment Board kanban with drag-drop, 8 stages, setter/closer roles
- [ ] Calendar view
- [ ] WhatsApp Link template + tap-to-chat everywhere
- [ ] Dashboard funnel + follow-up cards

**Phase 3 — team mechanics**
- [ ] Collab Pool with pool rules and access limits (follow-up % gate, max per grab)
- [ ] Sequence rules with timed hand-down
- [ ] Collaborator scorecard in Report

**Phase 4 — acquisition**
- [ ] Report: product funnel + campaign funnel with step conversion
- [ ] Facebook lead-form webhook ingestion + product routing rules
- [ ] Ad spend import → CPL / CPA / cost per conversion

**Phase 5 — growth**
- [ ] WhatsApp flows, broadcasts, run log, account limits
- [ ] Learning Hub

---

## 15. Where you can beat ZIEN (property-specific)

ZIEN is product-agnostic ("Product" = whatever you sell). You are property-only, so add what a generic lead CRM cannot:

1. **Listings module** — link a lead to specific units/projects; `viewing` becomes a first-class appointment type with the unit attached.
2. **Buyer qualification fields** — budget range, loan eligibility / DSR estimate, bumi lot, first-time buyer, cash vs loan, preferred area, tenure. Put these in structured fields instead of ZIEN's freeform `info` blob — then filter and match on them.
3. **Loan pipeline depth** — banks applied, approval status, MOF %, LO date. Your `LOAN SUBMITTED` column becomes a real sub-pipeline. This is where MY property deals actually die.
4. **Commission tracker** — gross commission, split between setter/closer/agency, invoice status. ZIEN has none of this.
5. **Project/developer inventory** — for new-launch agents, remaining units by type, so the funnel report ties leads to stock.
6. **Co-broke** — an external-agent flavour of Collab Pool.

Items 2, 3 and 4 are the ones that would make an agent switch from ZIEN to yours.

---

## 16. Notes for implementation

- Keep it a single Cloudflare Worker + D1 + KV (sessions) + R2 (Learning Hub media, WhatsApp media). No new infra needed for phases 1–4.
- All list endpoints: cursor pagination, workspace scoping enforced in a middleware, never in the query builder by hand.
- Compute derived counters (`followup_count`, `dormant_days`, funnel aggregates) with scheduled Workers cron rather than on every read.
- Every mutation writes a `lead_activity` row — the timeline is the audit log and the follow-up evidence at once.
- Build the Configuration modal as one component with a tab registry so each new screen just registers its tabs.
