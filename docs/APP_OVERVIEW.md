# PropertyAgent CRM — what exists, and what does not

Written 29 Aug 2026 for a reviewer coming to this codebase cold. It is a map and an
honest inventory, not a sales pitch. Read it before forming an opinion, because several
things that look like omissions are decisions, and are listed as such.

---

## What this is

A CRM for a **five-person Malaysian property agency** whose primary business is
**new launch / project sales of developer units**. Resale and rental are supported
alongside as the secondary mode.

Single tenant — this agency only. No org key on tables, no billing, no tenant
isolation. That is a deliberate scope decision, not an oversight.

It began life in July 2026 as a resale and rental CRM and was re-pointed at project
sales in late August, after the owner compared it against a competitor (ZEN CRM).
Roughly half of what follows was built in that pivot.

---

## Stack

| | |
|---|---|
| Framework | Next.js 15, App Router, React 19, TypeScript strict + `noUncheckedIndexedAccess` |
| Data | PostgreSQL on Supabase, Drizzle ORM, **hand-written** migrations |
| Auth | Clerk |
| Hosting | Cloudflare Workers via OpenNext, with Hyperdrive in front of Postgres |
| Files | Cloudflare R2 behind an S3-compatible adapter |
| CI/CD | GitHub Actions, manual-dispatch deploy with a dry-run input |
| Tests | Vitest — 213 passing across 13 files |

Deploys run from GitHub Actions rather than a laptop: OpenNext does not build on
Windows (`EPERM` creating `.next/standalone` symlinks), and the runner is Linux.

---

## Architecture conventions

Break these and the reviewer will be fighting the codebase rather than improving it.

- **Server Actions return `ActionResult<T>`** — `{success, data} | {success, error}`.
  Nothing throws across that boundary.
- **RBAC lives in the data layer**, never in the UI. `ownershipFilter` /
  `ownershipFilterAny` are applied to queries; `canEdit` / `canEditAny` gate mutations.
  Hiding a button is not access control here, and pages are written on that assumption.
- **Adapter pattern for every external service.** `lib/<service>/interface.ts` +
  `<provider>-provider.ts` + `index.ts`. App code never imports a vendor SDK.
  Present: `ai`, `auth`, `db`, `email`, `images`, `leadads`, `messaging`, `monitoring`,
  `storage`, `uploads`, `webhooks`.
- **Money is MYR integer cents.** Rates are integer basis points (250 = 2.50%).
  No floats anywhere near money.
- **Malaysia is UTC+8 all year.** Every date bucket and deadline uses a fixed +08:00
  offset. This has caused two separate bugs, both invisible in UTC — see "Traps".
- **Soft delete via `deleted_at`** on every table. Queries filter it; nothing is
  hard-deleted except by the PDPA erasure path.
- **All user-facing strings in `lib/constants.ts`**, written that way for eventual
  i18n (Bahasa Malaysia / Chinese). Not yet used.

---

## Data model

20 tables, 14 hand-written migrations (`0000_init` … `0013_deal_documents`).

| Group | Tables |
|---|---|
| People | `users`, `leads`, `contacts` |
| Inventory | `projects`, `project_unit_types`, `properties` |
| Activity | `appointments`, `activities`, `documents` |
| Money | `deals`, `deal_stages`, `campaign_spend` |
| Paperwork | `document_requirements`, `deal_documents` |
| Routing | `project_pool_members`, `lead_assignments`, `assignment_counter` |
| Intake | `lead_form_sources` |
| Messaging | `message_templates`, `message_log` |

Note `drizzle-kit generate` produces a **wrong diff** — the `meta/*.json` snapshots are
stale because migrations are hand-written. Keep writing them by hand.

---

## What is built

### Lead acquisition
- **Meta (Facebook/Instagram) Lead Ads** — signed webhook (`x-hub-signature-256` over
  the raw body, keyed by the App Secret) plus the GET handshake. Meta's webhook carries
  a *receipt*, not a lead, so `lib/leadads/` fetches the record from the Graph API with
  a Page token. Uses `fetch`, not the FB SDK, so it runs on Workers.
- **Google Ads lead form extension**, Tally, Typeform, and a generic signed webhook.
- **Public lead API** (`/api/public/leads`) with API keys and a Workers rate-limit
  binding.
- **CSV import** with dedup by phone and email.
- **`lead_form_sources`** + `/lead-sources`: an admin maps "form 8123… is the Skyline
  launch" without a deploy. Campaigns launch weekly; a code change per campaign is how
  a CRM stops being used.
- **E.164 phone normalisation** (`lib/phone.ts`) that refuses to guess rather than
  storing a wrong number.
- **Ad-level attribution** — campaign, ad set and ad names requested in the same Graph
  call, so cost reporting needs no second round trip.

### Lead routing
- **Per-project lead pools** with ordering, a paused state, and round-robin keyed per
  project so adding a project never perturbs another's sequence.
- **Automatic pass-on** for stalled leads, opt-in per project via
  `projects.pass_on_after_days`. Excludes: leads with any activity since assignment,
  leads with an appointment, qualified/disqualified/converted leads, pools of one,
  projects that have not opted in, and **agent-sourced leads** (`manual` / `import`).
- **`lead_assignments`** — append-only chain of custody. Every transfer also writes a
  timeline note naming both agents and messages each of them.
- Runs on a GitHub Actions schedule with a dry-run mode.

### Appointments
- Subject is a **property or a project**, enforced by a CHECK constraint.
- **Setter and closer** recorded separately; `ownershipFilterAny` lets either see it.
- Board by outcome, **no-show rate** excluding still-scheduled appointments.
- Booking against a project backfills the lead's `project_id` when blank.

### Deals and paperwork
- **Two pipelines** — new launch (Booked → SPA Signed → Loan Approved → Completed) and
  resale — separated by `deal_stages.pipeline` + `deals.deal_type`.
- **Document checklist** instantiated per deal from a per-pipeline template, with
  calendar-day deadlines in Malaysia time, file attachment, and chase lists on
  `/reminders` and the dashboard.

### Reporting
- **Funnel**: Leads → Appointments set → Showed up → Booked, by project and by agent,
  with a weekly trend. Built from leads and appointments rather than deal stages,
  because a deal is created late and the funnel must describe every enquiry.
- **Period filter** — 30d / 90d / 6m / 12m / all, in the URL.
- **Cost per lead / appointment / booking / closed deal** from `campaign_spend`.
- Validated chart palette in `lib/chart-colors.ts` (colour-blind separation and
  contrast checked, not eyeballed).

### Compliance and safety
- PDPA export, erasure and a scheduled retention purge.
- Consent captured per lead with a `consent_source` recording what the claim rests on.
- Signed webhooks, per-provider secrets, fail-closed on an unconfigured provider.
- CSP in report-only mode; upload sniffing by magic bytes rather than declared MIME.
- Nightly DB backup workflow and a restore-test workflow.

### Documentation
- `/help` in the app, role-filtered **server-side**.
- `docs/PropertyAgent-CRM-User-Guide.pdf`, built by `docs/build_user_guide.py`.
- Runbooks: `META_LEAD_ADS.md`, `MIGRATE_TO_AGENCY_SUPABASE.md`, `END_TO_END_TEST.md`,
  `SECURITY_REVIEW_2026-08-29.md`, `SESSION_HANDOFF.md`.

---

## Deliberate decisions — do not "fix" these

A reviewer will be tempted by several of these. Each was argued and is recorded in
`claude/crm-roadmap-and-competitor-review.md`.

1. **Inventory is project + unit types, not individual units.** The developer owns the
   availability list and it moves hourly; a mirrored copy goes stale, and a stale
   availability list is worse than none. The specific unit is captured on the booking.
   Adding a `units` table later is additive.
2. **A project deal starts at Booked**, not at Lead. The appointment board owns
   everything before that; repeating it as deal stages would count the same event twice.
3. **The funnel is built from leads and appointments, not deal stages.**
4. **Cost per booking counts LEADS that booked; the funnel counts booked APPOINTMENTS.**
   Different grains, deliberately. Neither should be changed to match the other.
5. **Per-agent reporting credits setting and closing separately.** Collapsing them
   credits people for work they did not do.
6. **The funnel chart is bars, not a tapered trapezoid** — area reads badly and
   flatters the top.
7. **Pass-on applies to project leads only, and only agency-sourced ones.** In resale
   the client relationship is the agent's asset; `server/leads/stale.ts` surfaces those
   rather than moving them.
8. **An unmapped Meta form still creates the lead.** Dropping a paid lead because
   nobody filled in a mapping is worse than filing it without a project.
9. **Attaching a file does not tick a checklist item** — somebody must confirm the
   document is the right one.
10. **Report stat tiles are not date-filtered.** Open pipeline is a snapshot.
11. **Projects are agency inventory; properties belong to the agent who won them.**
    The RBAC difference is intentional.
12. **Chart colours come only from `lib/chart-colors.ts`.**

---

## Known gaps — the honest list

### Config not done
- **R2 is not configured.** Every `S3_*` value is empty, so **no file upload works** —
  which guts the paperwork checklist's attachment feature. Highest-value quick fix.
- `RESEND_API_KEY` / `EMAIL_FROM` empty — no email sending.
- `TURNSTILE_SECRET_KEY` empty — the public lead form has no bot challenge.
- **Clerk is on TEST keys in production** (`SECURITY_REVIEW` item 1, High). Development
  instances have usage limits and no MFA.

### Real defects
- **Email-only leads are silently dropped.** `intakeSchema` requires a phone, so a lead
  form that does not ask for one loses every lead it produces — logged at `info`, no
  error, no retry. A live risk on a paid channel.
- **`/dashboard` was hitting Supabase statement timeout 57014** (10–23s) through the
  transaction pooler. Production now goes via Hyperdrive; **needs re-measuring**, not
  assuming.
- **Two phone normalisers** — `toE164` in `lib/phone.ts` and `toE164My` in
  `server/leads/csv.ts` solve the same problem twice.
- **Rate limiting fails open** when the Workers binding is absent (correct for a
  webhook, wrong if it silently happens in production). Confirm the
  `[rate-limit] threw, request allowed` line is *gone* in production logs.

### Not built
- **Project commission** (developer-paid, staged release, split across agency / setter /
  closer / co-broke). The largest remaining piece, deliberately held until real bookings
  exist to design against.
- **WhatsApp automation.** The messaging adapter produces click-to-chat links only. A
  Cloud API provider needs a `sendTemplate(to, {name, language, variables})` method
  added to `MessagingProvider` — the current `sendFollowUp(to, {message})` only works
  inside the 24-hour service window.
- **Meta app is unpublished**, so Meta never delivers in real time. Ingestion is proven
  end to end via `scripts/replay-meta-lead.mjs`, which signs a real lead exactly as Meta
  would. App Review + a privacy policy URL are the blockers.
- **Automatic ad-spend sync.** Spend is entered by hand; the competitor pulls it from
  the Marketing API. `ads_management` is already granted and the Graph adapter exists,
  so this is small and high-value.
- **Teams** — `team_id` is in the schema and `canEdit` honours it, but nothing sets it.
- **i18n** — constants are centralised for it; no translations exist.
- **Leaderboard** needs rework for the setter/closer split. Ranking on closings punishes
  setters and fights the pass-on rule.
- **Screenshots** — the user guide draws labelled placeholders; 15 shots are listed in
  `docs/SCREENSHOTS.md` and not yet taken.

---

## Traps worth knowing before changing anything

- **Timezone.** Two bugs, both invisible in UTC and only reproducible at UTC+8. Most
  recently `date_trunc(... at time zone 'Asia/Kuala_Lumpur')` returns a timestamp
  *without* time zone; passing it to `new Date()` reads it in the server's zone and
  every bucket shifts a day. Time buckets crossing the SQL/JS boundary must be
  **strings**. Test anything involving `date_trunc` with `TZ=Asia/Kuala_Lumpur`.
- **`db.execute` cannot bind a JS `Date`** — pass `toISOString()` with an explicit
  `::timestamptz` cast. It throws at bind time, i.e. a 500 rather than a wrong number.
- **Postgres returns `min()`/`max()` over bigint as strings.** Coerce explicitly.
- **Deadlines are calendar days in Malaysia time**, not elapsed milliseconds. The naive
  version made "due in 3 days" read as 2.
- **Hyperdrive holds the production credentials, not `DATABASE_URL`.** Changing the
  secret alone leaves production talking to the old database with no error anywhere.
- **`pnpm seed` deletes every row.** It refuses non-local databases unless
  `ALLOW_REMOTE_DESTRUCTIVE=1`.

---

## Where a review would help most

In rough order of value to this agency:

1. **Is the RBAC actually airtight?** It is the thing most likely to be quietly wrong
   and most damaging if it is. `lib/auth/rbac.ts`, and every query that should use it.
2. **The lead intake path end to end** — it is the paid channel, and silent loss there
   costs real money. The email-only drop is one known case; are there others?
3. **Reporting correctness.** Several figures are deliberately at different grains.
   Are the ones that should agree, agreeing?
4. **What a five-person agency needs that is missing**, as opposed to what a CRM
   product would have. Scope discipline matters more than feature count here.
5. **Anything in "Deliberate decisions" that is actually wrong.** They were argued, but
   argued by the same people who wrote the code.

What a review cannot tell from the repo: whether agents actually use it, and whether
the funnel numbers match what the principal sees in the bank.
