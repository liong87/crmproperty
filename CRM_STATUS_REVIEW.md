# PropertyAgent CRM — Status Review

**Date:** 10 August 2026
**Repo:** `Desktop/Claude/Propertyagent/crm` (origin `github.com/liong87/crmproperty`)
**Method:** full read of `app/`, `server/`, `lib/`, `components/`, `scripts/`, migrations and docs; `tsc --noEmit` and `next build` executed in a clean sandbox install.

---

## 1. Where the project actually stands

The app is **far more complete than its own documentation says**. README claims "Phase 0 complete — no auth/UI yet". In reality all of the following are built and working:

| Area | Status |
|---|---|
| Auth (Clerk), middleware, sign-in/up, user sync, `/pending` gate | Built |
| RBAC (admin / manager / agent) enforced in server actions | Built |
| Leads: CRUD, list + search + pagination, qualify → contact | Built |
| Contacts: CRUD, detail, activity timeline | Built |
| Properties: CRUD, image upload to R2, status control | Built |
| Deals + pipeline board | Built |
| Activities, follow-ups, reminders, WhatsApp deep links | Built |
| Reports + charts + leaderboard | Built |
| PDPA: export endpoint, hard delete, 24-month purge script | Built |
| Public lead capture: API key endpoint, Tally/Typeform webhooks, CSV import | Built |
| User management screen | Built |

**Build health:** `tsc --noEmit` passes clean under `strict` **plus `noUncheckedIndexedAccess`** — a demanding setting most codebases can't enable. `next build` succeeds, 25 routes, ~102 kB shared JS. ~5,600 lines of app code. No `any` outside the deliberately-typed webhook mappers.

**Architecture rule holds.** Verified by grep: `@clerk/nextjs` appears only in `lib/auth/`, `@neondatabase/serverless` only in `lib/db/client.ts`, `@aws-sdk/*` only in `lib/storage/r2-provider.ts`, `resend` only in `lib/email/resend-provider.ts`. Nothing in `app/`, `server/` or `components/` imports a vendor SDK. **This is why the Clerk→Auth.js and Neon→Supabase swap you're planning is genuinely cheap** — see §5.

---

## 2. Must fix before this carries real client data

### 2.1 The form webhook is a wide-open public write endpoint
`app/api/webhooks/forms/[provider]/route.ts:67` — `middleware.ts:13` exempts `/api/webhooks/(.*)`, and the handler does no signature check, no shared secret, no rate limit.

Anyone can `curl -X POST /api/webhooks/forms/generic -d '{"name":"x","phone":"+60...","consentGiven":true}'` and: create unlimited leads, trigger WhatsApp pings to a real agent's phone, and **forge PDPA consent** — `consent_given_at` gets stamped for a person who never consented, which is the exact record you'd rely on in a dispute.

Worse, it's a **PII existence oracle**: the response returns `deduped: true` when the phone already exists, so anyone can test whether a given phone number is your client — unauthenticated.

*Fix:* per-provider signing secret (Tally and Typeform both send one), or a secret path segment; drop the `deduped` flag from the response; add rate limiting.

### 2.2 Any agent can read any other agent's leads and contacts
`app/(dashboard)/leads/[id]/page.tsx:18` and `contacts/[id]/page.tsx:18` fetch by ID with **no ownership check**. `canEdit` is computed but only used to hide buttons.

Agent A visits `/contacts/<any-uuid>` and sees name, phone, email, budget, nationality, occupation, **ID type + NRIC/passport number**, private notes, and the full activity timeline. The list pages *are* correctly scoped via `ownershipFilter` — the detail pages defeat that.

*Fix:* add a `canView` gate in the page (or push scoping into `getLeadById`/`getContactById`/`listActivitiesForEntity`).

### 2.3 PDPA export accepts offboarded admins
`app/api/contacts/[id]/export/route.ts:9` uses `getCurrentDbUser`, which — unlike `requireDbUser` — checks neither `active` nor `deletedAt`. Since `deleteUser` deliberately does *not* revoke the Clerk identity, a sacked admin's existing session still returns the full PII bundle from this route. The dashboard correctly bounces them to `/pending`; this route is the one hole in that fence.

### 2.4 Authorization silently skipped on image delete
`server/properties/images.ts:74` — `if (property) assertCanEdit(...)`. `documents.entityId` is polymorphic and `getPropertyById` filters soft-deleted rows, so when the lookup returns null the guard is **bypassed** and execution proceeds to the R2 delete. Any authenticated agent can permanently destroy documents attached to contacts, leads, deals, or soft-deleted properties. Also `listPropertyImages` (line 88) is an exported server action with **no auth check at all**.

### 2.5 `pnpm install` is broken on a clean checkout
`package.json:43` declares `@opennextjs/cloudflare` but **`pnpm-lock.yaml` has no entry for it**. So `--frozen-lockfile` (what CI, Vercel and Cloudflare use) fails outright, and a plain install hits a 403 on `pkg.pr.new`. The docs tell you to `pnpm add -D` it — that's the thing that fails. *The fix is the opposite: remove it and the `cf:*` scripts until a published stable version exists.* I verified this by reproducing both failures.

---

## 3. Correctness bugs worth fixing

**Race conditions (both disappear once you're on a real Postgres driver with transactions — see §5):**

- `server/leads/convert.ts:38` — `qualifyLead` reads `convertedToContactId`, then inserts, with no transaction and no conditional update. A double-clicked Qualify button creates **two contacts for one person**, one of them orphaned.
- `server/leads/intake.ts:51` — round-robin assignment is a 3-round-trip read-modify-write. Two concurrent leads (landing page + webhook, or any CSV import) both go to the same agent. Also `nextIndex` is stored *after* the modulo, so adding or deactivating an agent makes the rotation jump. One `UPDATE … SET last_index = last_index + 1 RETURNING last_index` fixes both.

**Silent data loss:**

- `server/leads/intake.ts:97` — dedup doesn't exclude converted or disqualified leads, and has no `ORDER BY`/`LIMIT`. A past customer enquiring again matches their old **converted, read-only** lead: the new enquiry is never created and never assigned to anyone. For a returning-customer business that's lost revenue, silently.
- `server/leads/import.ts:66` — `rm()` returns `NaN` for `"1,200,000"`, `"RM 850000"` or any thumb-formatted budget, which fails Zod and **rejects the entire row** — name, phone and all. Thousands separators are the Excel default. Line 71: `Buy`/`Rent` (capitalised, as humans type) also reject the whole row, though the webhook path lowercases correctly. Line 82: error row numbers are wrong whenever the CSV has blank lines, making the error list useless for fixing the file.
- `server/leads/import.ts:75` — every imported row is hardcoded `consentGiven: true`. Same PDPA record-keeping problem as §2.1.

**Money unit ambiguity:** the MYR-integer-cents contract holds correctly everywhere in the UI (verified all four write and read paths). But `intakeSchema` accepts `budgetMin`/`budgetMax` as bare integers with no unit, while CSV import documents them as Ringgit and multiplies by 100. A landing page POSTing `budgetMax: 800000` stores **RM 8,000** — off by 100×, silently. Only unbitten because the sample form doesn't send budgets.

**Timezone:** `components/activities/add-activity.tsx:28` does `new Date(followUp).toISOString()` on a `datetime-local` value, which parses in the **browser's** zone, while both display sites force `Asia/Kuala_Lumpur`. An agent on a device set elsewhere types 09:00 and the reminder fires at a different hour. `APP_TIMEZONE` exists in `.env` and is referenced nowhere in the codebase (same for `DEFAULT_CURRENCY`, `MESSAGING_PROVIDER`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_SENTRY_DSN` and three others).

**Leaderboard is one rename away from reading RM 0.00:** `server/reports/queries.ts:97` matches `dealStages.name === "Closed Won"` as a string, while the stages table is documented as editable without deploys. Match on a slug or `isTerminal` flag instead.

**Conversion rate is inflatable:** `updateLead` accepts `status: "qualified"` directly, and reports derive `qualifiedLeads` from `leads.status` rather than `convertedToContactId IS NOT NULL`.

**N+1 queries:** `/reports` runs 3 queries per user (15 round trips at 5 staff); `listFollowUps` resolves one entity per row with **no LIMIT**, then the dashboard slices to 5 — 200 open follow-ups means 200 queries to show five. CSV import awaits 4-6 queries per row serially, so the documented 1,000-row cap is 4,000-6,000 sequential round trips and will time out with no partial-progress record.

**Pagination drops filters:** `app/(dashboard)/properties/page.tsx:88` — the Next/Prev links carry only `page`. Filter to Selangor/terrace/active, click Next, and you silently get page 2 of the unfiltered set. `/leads` and `/contacts` do this correctly. That page's filter form also has no submit button.

**Silent UI failures:** `activity-timeline.tsx` and `follow-up-list.tsx` discard the `ActionResult` from `completeFollowUp`/`deleteActivity` and just `router.refresh()`. A rejected delete looks like it worked. Every other component surfaces `res.error`.

---

## 4. Gaps in operations

- **Zero tests.** No `*.test.*`, no `vitest.config.*` — but vitest is installed and README documents `pnpm test`, which currently **exits non-zero** on a clean checkout. Highest-value targets: `parseCsv` + `rm()` (pure functions, would have caught four bugs above), `pickAssignee`, `lib/auth/rbac.ts` (3 roles × owned/not-owned matrix), `formatMYR`/`pricePerSqft`.
- **Sentry is installed but never initialized.** No `sentry.*.config.ts`, no `instrumentation.ts`, no `withSentryConfig` in `next.config.mjs`. `lib/monitoring/sentry-provider.ts:25` calls `captureException` on an uninitialized SDK, so events are dropped — and because setting `SENTRY_DSN` skips the `console.error` fallback, **turning Sentry on currently makes error reporting worse**.
- **Nothing schedules the PDPA purge.** `scripts/purge-stale-leads.ts` is correct, but there's no GitHub Actions workflow, no `wrangler.toml` cron, no `vercel.json`. The 24-month retention obligation isn't actually being met. ~15 lines of YAML fixes it.
- **Env vars fail at runtime, not boot.** `lib/storage/r2-provider.ts:6` reads `S3_BUCKET!` etc. at module scope with non-null assertions; unset means an opaque AWS SDK error on first upload. A Zod env schema validated once at startup is the single highest-value ops improvement.
- **Cloudflare deploy can't work as documented** — no `wrangler.toml`, no `open-next.config.ts`. Vercel is the only viable path today, and only after §2.5 is fixed.
- **`pnpm lint` is broken** — script exists, no ESLint config or dependency.
- **Docs to fix:** README status/next-phase sections, the non-existent `../prompt_crm_v2.md` and `SESSION_LOG` references, the missing `.env.example` that both quick-starts open with, and DEPLOYMENT.md:89 claiming public lead capture isn't built.
- **Dead code:** `lib/ai/` is an empty directory (won't even survive a clone). `lib/email/*` and the `resend` dependency are never imported — **no email is ever sent**. The `message_templates` table is seeded and never read; WhatsApp copy is hardcoded, so "editable without deploys" is false. Also unused: `expectedCloseDate`, `commissionPct` (written, never shown), `assignLead`, `countOpenFollowUps`.
- **`users.teamId` is never populated and no `teams` table exists**, so `ownershipFilter` always falls through for managers — **managers see everything, always**. The documented "manager → edit team data" model is inert. Decide whether to build teams or delete the concept.

**Database:** migrations are in sync with the schema, cascade rules are sensible, and `0000_init.sql` is clean and idempotent. Gaps: **no index on any `created_at`** despite every list query being `ORDER BY created_at DESC LIMIT/OFFSET` — partial indexes (`... WHERE deleted_at IS NULL`) would serve filter and sort together. `activities.follow_up_done_at` is filtered on every reminders load and unindexed. `leads.converted_to_contact_id` has no FK (the code comment says "added in relations", but there are no `relations()` declarations anywhere, and they wouldn't emit a constraint anyway). Stray duplicate `lib/db/migrations/meta/meta/` directory — safe to delete.

---

## 5. Migrating off Clerk and Neon

**Decision:** Supabase Postgres now, self-hosted VPS later; Auth.js (NextAuth v5) for auth.

Both are sound, and importantly **the "Supabase now, VPS later" path costs nothing extra** — provided we connect with the standard `postgres-js` driver over a plain connection string and never touch the Supabase SDK. Moving to your own VPS then becomes a `DATABASE_URL` change plus a `pg_dump`/restore.

**Yes, Auth.js is free** — MIT-licensed, self-hosted, no vendor, no per-user pricing. Sessions live in your own Postgres via the Drizzle adapter, so they migrate with the database. It's the best-documented option for Next.js 15 App Router.

### Why this is a small job here
The adapter architecture means the blast radius is contained:

- **Database:** `lib/db/client.ts` is the *only* file with Neon-specific code. Swap `@neondatabase/serverless` for `postgres-js` + `drizzle-orm/postgres-js`. Schema, migrations, and all query code are untouched.
- **Auth:** `lib/auth/` has `interface.ts` + `clerk-provider.ts` + `active-provider.ts`. Add `authjs-provider.ts` implementing the same interface, flip `active-provider.ts`. `provider-components.tsx` (the `<AuthUIProvider>` wrapper) and `middleware.ts` also change; the sign-in/sign-up pages get rewritten. **Nothing in `server/` or `components/` changes** — they only ever call `requireDbUser()` / `getCurrentDbUser()`.

### Bonus: this fixes two of the bugs above
Neon's HTTP driver has **no transaction support** — that's the root cause of both race conditions in §3, and the code comments admit it. `postgres-js` against Supabase (or any real Postgres) gives you `db.transaction()`, so `qualifyLead` and round-robin assignment become correct rather than "atomic enough".

### Things to watch
- **Connection pooling.** Serverless + Postgres needs Supabase's pooler (port `6543`, transaction mode, `prepare: false` in `postgres-js`) or you'll exhaust connections. Use the direct connection (`5432`) only for migrations.
- **`users.externalAuthId`** currently holds Clerk IDs. Auth.js accounts get new IDs, so plan a re-link — easiest is matching on email at first login, which `lib/auth/sync.ts:40` already does.
- **Auth.js needs its own tables** (`accounts`, `sessions`, `verification_tokens`) alongside your existing `users` — one new migration, and the Drizzle adapter can map to your existing `users` table so `role`/`active`/`teamId` keep working.
- **Password reset / email verification.** Clerk gave you these free. With Auth.js you either use magic links (needs a working mailer — note `lib/email/` is currently dead code, so Resend needs wiring up or replacing) or email+password with your own reset flow. For a 5-person internal team, **magic links are the lower-effort and more secure choice.**
- Do the migration on a branch with a Supabase project seeded from `scripts/seed.ts`, and keep Clerk live until the new path is verified end to end.

---

## 6. Suggested order of work

1. Unbreak the build: remove `@opennextjs/cloudflare` from `package.json` + `cf:*` scripts, regenerate the lockfile. *(minutes)*
2. Lock down the webhook endpoint (§2.1) and add `canView` to the lead/contact detail pages (§2.2). These two are the real PDPA exposure. *(hours)*
3. Fix the export-route auth check (§2.3) and the image-delete guard (§2.4). *(under an hour)*
4. **Migrate Neon → Supabase** (§5). Do this before the auth swap — it's the smaller change, and it unlocks transactions.
5. Fix the two race conditions using the transactions you now have (§3).
6. **Migrate Clerk → Auth.js** (§5).
7. Fix the CSV import and dedup data-loss bugs (§3) — these are quietly costing leads today.
8. Add the GitHub Actions cron for the PDPA purge; wire up or remove Sentry; add a Zod env schema.
9. Backfill tests on the pure functions (`parseCsv`, `rm`, `rbac`, `formatMYR`) and the money-unit contract.
10. Rewrite README + DEPLOYMENT to match reality; add `.env.example`; delete `lib/ai/` and the dead email/template code, or finish them.
