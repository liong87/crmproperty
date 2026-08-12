# Phase 2 + Phase 4 — Supabase migration and the data-loss bugs

**Verified:** `tsc --noEmit` clean · `next build` succeeds · `vitest run` **53 tests passing** · every database change exercised against a real PostgreSQL 16, including concurrency.

Apply on top of the Phase 0/1 patch, then `pnpm install`.

---

## Phase 2 — Neon → Supabase (one file, as designed)

**`lib/db/client.ts`** is the only application file that changed. `@neondatabase/serverless` is gone; `postgres` (postgres-js) is in.

Deliberately **no Supabase SDK, no Supabase Auth, no Row Level Security** — just a PostgreSQL connection string. That's what keeps Supabase interchangeable with your own server later: moving to Option D becomes a `pg_dump`, a restore, and a changed environment variable.

Three things the new client gets right that matter in production:

**`prepare: false` when pooling.** Supabase's transaction-mode pooler cannot hold server-side prepared statements. Leaving this on produces intermittent *"prepared statement already exists"* errors — the kind that only appear once two agents use the system simultaneously, and are miserable to diagnose.

**`max: 1` connection per instance.** Serverless runtimes spin up many short-lived instances; a large pool in each exhausts the database's connection limit.

**Two URLs.** `DATABASE_URL` is the pooler (port 6543) for the app. `DIRECT_DATABASE_URL` is the direct connection (port 5432) for migrations — DDL and advisory locks don't work through transaction pooling. `drizzle.config.ts` now uses the direct one and falls back to `DATABASE_URL` for local development.

### Verified against real PostgreSQL

Applied your migration files to a clean database and ran the app's own schema and query code through the new client:

```
1. connected                        ✓
2. insert + returning               ✓
3. select via index                 ✓
4. MYR cents preserved as number    ✓  128000000 (number)
5. transaction ROLLBACK             PASS
6. transaction COMMIT               PASS
7. conditional claim pattern        PASS
8. atomic counter increment         PASS
```

Items 5–8 were **impossible on the Neon HTTP driver** — it has no interactive transactions, which is exactly why the two races below existed. The code comments in `convert.ts` even said so.

---

## Phase 4 — the correctness bugs

### Duplicate contacts on a double-click — fixed and proven

`server/leads/convert.ts` read `convertedToContactId`, then inserted a contact, then updated the lead, with no transaction. A double-clicked **Qualify** button created **two contacts for one person** — one orphaned, both counted in the leaderboard.

Now: one transaction, and the lead is claimed with a conditional `UPDATE ... WHERE converted_to_contact_id IS NULL`. The loser rolls back, so no orphaned contact survives. If a request loses the race it returns the winner's contact rather than an error — the user's intent was satisfied either way.

**Tested with 8 simultaneous Qualify calls on one lead:**

```
winners: 1  |  rolled back: 7
contacts created: 1 (must be exactly 1)          PASS
lead points at the surviving contact             PASS
```

### Round-robin assignment race — fixed and proven

`pickAssignee` did SELECT-then-UPDATE as separate round trips. Two leads arriving together (landing page + webhook, or any CSV import) both read the same index, went to the **same agent**, and the counter advanced by one instead of two.

Now a single statement: `INSERT ... ON CONFLICT DO UPDATE SET last_index = last_index + 1 RETURNING last_index`. The stored value is monotonic and the modulo is applied at read time — the old code stored the *post*-modulo value, so adding or deactivating an agent made the rotation jump instead of continuing.

**Tested with 40 concurrent assignments across 4 agents:**

```
distribution: 10 / 10 / 10 / 10 across 4 agents   PASS
counter still rising after deactivating an agent  PASS
```

### Returning customers were being silently discarded — fixed

The dedup query in `server/leads/intake.ts` matched **any** lead, including ones already converted to a contact or marked disqualified. A past client enquiring again was matched to their old read-only record: the pipeline appended a note nobody reads, reported success, and **the new enquiry was never created and never assigned to anyone.**

For a business built on repeat clients and referrals, that is lost revenue with no trace it happened. Now scoped to open leads only (`converted_to_contact_id IS NULL` and status not `disqualified`), with `ORDER BY created_at DESC LIMIT 1` — without an ORDER BY, PostgreSQL row order is unspecified, so which lead received the note could vary between runs.

### CSV import — rewritten, with 31 tests

Extracted the pure functions into **`server/leads/csv.ts`** so they can be tested, then fixed what was rejecting good data:

| Was | Now |
|---|---|
| `1,200,000` → `NaN` → **entire row rejected** | `120000000` cents |
| `RM 850000` → **row rejected** | parsed |
| `850k` / `1.2m` → **row rejected** | parsed |
| `Buy` / ` RENT ` → **row rejected** | mapped to `buy` / `rent` |
| `012-345 6789` → **row rejected** | `+60123456789` |
| Error line numbers wrong after any blank line | true source line, and the row's name |
| `consentGiven: true` hardcoded on every row | read from the file; counted when absent |

Headers are now matched loosely — case, spaces, underscores and hyphens ignored — so **Facebook Lead Ads exports ("Full Name", "Phone Number") and Google Ads "CSV for CRM" files import without editing them first.** That's the manual FB lead route working out of the box.

The import screen now also warns how many rows arrived with no consent evidence, instead of quietly stamping `consent_given_at = now()` on all of them.

---

## Setting up Supabase

```bash
# 1. Create the project — choose Southeast Asia (Singapore)
# 2. Settings → Database → Connection string. You need BOTH:
#    DATABASE_URL         ...pooler...:6543/postgres   ← app
#    DIRECT_DATABASE_URL  ...:5432/postgres            ← migrations
pnpm db:migrate
pnpm seed
pnpm dev
```

Then set up the backup workflow from the earlier `crm-backup-setup.zip` — the free plan has no backups, and your app contains hard-delete purge routines.

---

## Remaining, in priority order

1. **Backups** — the workflow is written and tested; it needs the six GitHub secrets and one manual restore test.
2. **PDPA purge cron** — `scripts/purge-stale-leads.ts` still isn't scheduled anywhere.
3. **`pnpm cf:preview`** — settles the Option B question.
4. **Env validation at boot** — `lib/storage/r2-provider.ts` reads `S3_BUCKET!` at module scope, so a missing value surfaces as an opaque AWS error on first upload rather than at deploy.
5. **Database indexes** — nothing on `created_at`, though every list query sorts by it. Partial indexes (`WHERE deleted_at IS NULL`) would serve filter and sort together.
6. **Timezone** — `add-activity.tsx` parses `datetime-local` in the *browser's* zone while both display sites force Asia/Kuala_Lumpur, so reminders fire at the wrong hour for anyone whose device is set elsewhere.
7. **N+1 queries** — `/reports` runs 3 per user; `listFollowUps` resolves one entity per row with no LIMIT, then the dashboard slices to 5.

Items 1–3 are the ones I'd finish before your launch. The rest can follow.
