# CRMREVAMPSPEC.md — audit against what we have

Audited 2 Sep 2026 against the spec's §14 gap list.

Legend: **have** · **partial** · **missing** · **won't** (with a reason)

---

## Phase 1 — foundation

| Item | State | Notes |
|---|---|---|
| Workspace + roles + upline | **partial — workspace won't** | Roles are `admin / team_lead / agent` and `users.team_lead_id` is the upline. **No `workspace` table, and we should not add one.** The spec assumes multi-tenant SaaS; this is one agency of five. Workspace-scoping every query and index to satisfy a tenant count of one is cost with no benefit, and it is the kind of thing that is cheap to add later against real demand and expensive to carry now. |
| Configuration modal (Products, Sources, Statuses, Display) | **missing** | Statuses are the `LEAD_STATUS` constant, sources are a `varchar`, "products" are our `projects` table. All hardcoded. This is the largest genuine Phase 1 gap after Working Leads. |
| Master Leads table, 9 sortable columns, chips, bulk select | **partial** | `/leads` has sortable Lead/Status/Added, status chips, bulk select, and LEAD/SOURCE/INTEREST/BUDGET/ASSIGNED/STATUS/ADDED. Missing: `INFO`, `PRODUCT`, `↻` recycle count, `D` dormant days, `COLLABORATORS` stack. |
| Add Lead + CSV import, phone normalisation, dedupe | **have** | `/leads/new`, `/leads/import`, `lib/phone.ts` `toE164` (MY default), dedupe in `createLeadFromIntake`. |
| Working Leads queue, Active/Inactive/Appointment, cards | **BUILT THIS PASS** | See below. |
| `lead_activity` timeline + explicit log-follow-up | **have + BUILT** | `activities` table already was the timeline; the missing half was a one-click way to log a touch, now on every queue card. |
| Follow-up rate + `x/y · N%` pill | **BUILT THIS PASS** | On Working Leads. Not yet on every screen. |

## Phase 2 — closing loop

| Item | State |
|---|---|
| Appointment kanban, drag-drop, setter/closer | **have** — 5 stages, dragging, setter+closer already modelled |
| 8 stages (`BOOKING FEE`, `LOAN SUBMITTED`, `CONVERTED`…) | **missing** — we have 5; extending needs configurable stages |
| Calendar view | **missing** |
| WhatsApp link template everywhere | **partial** — `wa.me` deep links exist; no saved template (hardcoded default on the queue cards) |
| Dashboard funnel + follow-up cards | **partial** — funnel strip and period filter shipped; no follow-up card yet |

## Phase 3 — team mechanics

Collab Pool **missing** (we have project lead pools + rotation, which is the push version of the same idea, not the pull). Sequence rules **partial** — `pass-on.ts` hands stalled project leads down a pool on a timer, which is §12.3 without the rule editor. Collaborator scorecard **partial** — `/team` shows logged activity per member.

## Phase 4 — acquisition

Product funnel **have** (`server/reports/funnel.ts`, per project and per agent, with step conversion). Facebook webhook ingestion **have**, signed, plus form creation and per-form field mapping — ahead of the spec here. Campaign funnel **partial**: `utmCampaign/utmContent/utmTerm` carry campaign/adset/ad already; the gap is **spend per ad**, since `campaign_spend` is keyed on campaign name only. Ad spend → CPL/CPA **partial** for the same reason.

## Phase 5 — growth

WhatsApp flows/broadcasts **missing** and gated on a WABA, a dedicated number and template approval — see `docs/LEAD_CAPTURE_AND_WHATSAPP.md`. Learning Hub **missing**.

## §15 — where we already beat ZIEN

Commission tracker (§15.4) is **built and arithmetic-verified** — schemes, setter/closer/agency/co-broke splits, staged release. ZIEN has none. Project/developer inventory (§15.5) is **built** — projects, unit types, sales kits. Structured buyer qualification (§15.2) is **partial**: `interest`, `budgetMin/Max`, `preferredAreas` are structured where ZIEN has a freeform blob, but loan eligibility, bumi lot, tenure and cash-vs-loan are not there. Loan pipeline depth (§15.3) is **missing** and is, per the spec's own reading, where MY property deals actually die.

---

## Built this pass

**Working Leads** (`/working-leads`) — the spec's central idea, and the one thing we
genuinely did not have: two surfaces over the same rows. `/leads` is the database.
This is the queue: only mine, only workable, **quietest first**, as cards with actions
rather than a table.

Tabs are Active / Appointment / Inactive. Our mapping differs from the spec and the
difference is deliberate: the spec's "Inactive" is a marked cold/snoozed state we have
no column for, so Inactive is `status = disqualified` and going-cold is surfaced instead
by a **dormancy badge** on every active card (amber at 7 days, red at 14). That is the
same information without a state nobody remembers to set.

**Follow-up rate** — `followed / total` over a 7-day window, as the pill in the header.
The denominator excludes disqualified leads on purpose: counting them would let an agent
improve the number by giving up on people, which is the exact behaviour the metric
exists to discourage.

**Derived, not denormalised.** The spec proposes `last_followup_at`, `followup_count`
and `dormant_days` as columns refreshed by a cron. They are computed from the activity
timeline instead. At five agents the query costs nothing, and a cached counter has one
failure mode — going stale and quietly lying about whether somebody rang a client. If it
ever gets slow the answer is a materialised view, not a column nobody can prove is
current.

**Touch buttons write real activities.** "Called" and "WhatsApp" go through the same
`logActivity` path the lead page uses, so the timeline, the follow-up rate and the
dormancy badge all move together. A button that only bumped a counter would make the
metric a lie inside a week. WhatsApp opens the chat with the message pre-typed and **not
sent**, and the timeline says "opened WhatsApp" rather than claiming a send we cannot
observe.

## Recommended next, in order

1. **Configuration: statuses and sources.** Everything downstream (funnels, chips,
   sequences) is shaped by these, and they are currently constants in a TypeScript file.
2. **Master Leads remaining columns** — dormant days and recycle count now that both are
   computed; collaborators stack.
3. **Follow-up card on the dashboard**, reusing the pill.
4. **Loan pipeline depth (§15.3)** — ahead of anything else in Phase 3+, because it is
   the property-specific thing ZIEN structurally cannot copy.
