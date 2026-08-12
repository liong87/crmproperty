# PropertyAgent CRM — Migration & Cost Plan

**Date:** 10 August 2026
**Context:** 5-person property agency, Malaysia. Goal: get off Clerk and Neon, minimise total running cost, keep the option of self-hosting later.
**Companion doc:** `CRM_STATUS_REVIEW.md` (findings referenced below as §2.1 etc.)

---

## 0. Correction to the earlier recommendation

I previously suggested Auth.js (NextAuth v5). **That was based on outdated information — use Better Auth instead.**

On 22 September 2025 the Auth.js project was handed to the Better Auth team, who put it in maintenance mode and now say: *"We strongly recommend new projects to start with Better Auth unless there are some very specific feature gaps."* As of the July 2026 security update, `next-auth` v4 is the LTS line and **v5 is still in beta** — roughly three years now.

Better Auth is the same deal you wanted: MIT, free, self-hosted, no per-user pricing, sessions in your own Postgres. Two specifics make it a better fit for this codebase:

1. **Built-in admin/roles support** — you already hand-rolled admin/manager/agent in `lib/auth/rbac.ts`, with a `teamId` column that's never populated.
2. **Database-backed sessions, so revocation actually works.** This directly fixes §2.3 — the offboarded admin who can still hit the PDPA export endpoint because `deleteUser` can't revoke the identity at the auth provider. With Auth.js's JWT sessions you'd have to build a token denylist yourself.

---

## 1. The cost question — where the money actually is

For a 5-person internal CRM, **the database is not your cost risk. App hosting is.**

Here's the thing that matters most, and it's easy to miss: **Vercel's Hobby (free) plan is licensed for non-commercial personal use only.** A CRM your agency runs its business on is commercial use. If you're on Hobby today you're outside their terms, and the fix is Pro at **$20/month per deploying seat**.

Everything else in your stack is genuinely, sustainably free at your scale.

### Component-by-component

| Component | Option | Monthly (USD) | Notes |
|---|---|---|---|
| **Database** | Supabase Free | **$0** | 500 MB DB, 1 GB file storage, 5 GB egress, 50k MAU, 2 projects, 7-day backup snapshot. Singapore region available. |
| | Supabase Pro | $25 | Removes the inactivity pause, daily backups |
| | Postgres on your own VPS | $0 | Included in the VPS cost below |
| **App hosting** | Vercel Hobby | $0 | ⚠️ **Not licensed for commercial use** |
| | Vercel Pro | $20/seat | Zero-friction, best Next.js support |
| | Cloudflare Workers Free | $0 | 100k req/day, but only **10 ms CPU per invocation** — too tight for Next.js SSR |
| | Cloudflare Workers Paid | $5 | 10M requests + 30M CPU-ms included; realistic for SSR |
| | Your own VPS | $6–12 | See §3 |
| **File storage** | Cloudflare R2 | **$0** | 10 GB free, and **no egress fees** — you already chose this, it's the right call, keep it |
| **Auth** | Better Auth | **$0** | Self-hosted, MIT |
| **Email** | Resend free tier | **$0** | ~3k/month. Note `lib/email/` is currently dead code — nothing sends email today |
| **Error monitoring** | Sentry free tier | **$0** | Currently installed but never initialised (§4) |
| **Domain** | — | ~$1–2 | |

### Three realistic totals

| Path | Stack | USD/mo | ~MYR/mo |
|---|---|---|---|
| **A — Managed, easiest** | Supabase Free + Vercel Pro | **$20** | ~RM 95 |
| **B — Cheapest legitimate managed** | Supabase Free + Cloudflare Workers Paid | **$5** | ~RM 24 |
| **C — One VPS, everything** | Vultr/DigitalOcean Singapore 2 GB, Postgres + Next.js + Caddy, Cloudflare free in front | **$12** | ~RM 57 |

**The honest read: the spread between these is at most about USD 180/year.** That is not enough money to justify choosing badly. Optimise for your time and for not losing client data, not for the $15/month.

Note Path B has a catch today: Cloudflare deployment is currently broken in your repo — `@opennextjs/cloudflare` is in `package.json` but missing from the lockfile, and there's no `wrangler.toml` or `open-next.config.ts` (§2.5, §4). Budget half a day to make that path work, or start on A and move later.

---

## 2. Supabase now — yes, and here's how to keep the exit door open

Supabase free tier is the right starting point. What matters is **connecting in a way that makes the later VPS move trivial**:

- Use the **`postgres-js` driver over a plain `DATABASE_URL`**. Do not use the Supabase JS SDK, Supabase Auth, or Row Level Security. Then Supabase is just "a Postgres server someone else runs," and moving to your own box is a connection-string change plus `pg_dump`/`pg_restore`.
- Pick the **Southeast Asia (Singapore, `ap-southeast-1`)** region — lowest latency to KL.
- Use the **pooler on port 6543** (transaction mode, `prepare: false` in `postgres-js`) for the app, and the direct connection on 5432 only for migrations.

### Free-tier limits, checked against your actual usage

- **500 MB database.** Your property *images* go to R2, not Postgres, so what's in the DB is text rows. A 5-agent agency would need many tens of thousands of leads/contacts/activities to approach this. Years away.
- **5 GB egress/month.** The one to watch. Should be fine for 5 internal users, but check it after a month of real use.
- **Projects pause after 7 consecutive days with no database requests.** A CRM used daily will never pause. But if you spin up a *staging* project, it will — don't be surprised.
- **7-day snapshot backups only** (daily backups are a Pro feature). **Run your own `pg_dump` on a schedule regardless.** This is the single most important operational habit, on any path.

---

## 3. Self-hosting later — the real advice

### If you do this, put the server in Singapore, not Europe

Hetzner is the usual "cheapest VPS" answer (~$8 for 4 GB, 20 TB bandwidth) and it's excellent value — **but their regions are Germany, Finland and US East only.** From Kuala Lumpur that's roughly 200 ms+ round trip on every database query and page load, and your app makes several sequential queries per page (§3 of the review, the N+1 problems). It would feel sluggish.

Providers with Singapore presence (~15–20 ms from KL):

| Provider | Entry plan | Notes |
|---|---|---|
| **Vultr** | from $3.50 (1 vCPU / 0.5 GB) | 30+ regions incl. Singapore, NVMe |
| **DigitalOcean** | $6 (1 GB), $12 (2 GB), $24 (4 GB) | SGP1 region, best docs and tooling |
| **Linode/Akamai** | comparable | Singapore region |

**Get 2 GB minimum.** 1 GB will not comfortably run a Next.js production build *and* Postgres on the same box — Next builds are memory-hungry. Either take 2 GB (~$12) or build elsewhere (CI) and only run the server on the small box.

### What self-hosting actually costs you

The $12/month is the easy part. The real price:

- **Backups you own.** Automated `pg_dump` to R2 (cheap, no egress fees) — *and a restore you have actually tested.* An untested backup is not a backup.
- **OS and Postgres security patching**, indefinitely.
- **Uptime is yours.** If the box dies on a Saturday while an agent is with a client, that's your afternoon.
- **TLS, firewall, fail2ban, monitoring, log rotation** — one-time setup, ongoing attention.

For a 5-person agency, **that's real work to save ~$8/month versus Path B.** Self-host when you have a *reason*, not to save money.

### Good reasons to move to your own VPS

- You exceed 500 MB or 5 GB egress and Supabase Pro's $25 starts to look worse than a VPS.
- **Data residency.** Malaysia's PDPA has cross-border transfer provisions, and hosting client PII — you're storing NRIC/passport numbers, per §2.2 — in Singapore versus Malaysia may matter to you or to a corporate client's due diligence. I'm not a lawyer; if this could affect a deal, get proper advice before it does. A Malaysian VPS provider would be the answer if so.
- You want real transactions and full Postgres control (though Supabase gives you both already).
- Vendor pricing changes and you want the option to walk.

### My recommendation

**Start on Supabase free in Singapore. Set a calendar reminder to review in 6 months** against the triggers above. If none have fired, don't move — you'll have spent nothing and lost nothing. The `postgres-js` approach means the door stays open either way.

For app hosting, **Path A (Vercel Pro, $20)** if you'd rather spend money than evenings; **Path B (Cloudflare, $5)** if you're happy to spend half a day fixing the OpenNext setup first. Either is defensible. What isn't defensible is staying on Vercel Hobby for a commercial product.

---

## 4. The plan, in order

Sequenced so each step de-risks the next. Estimates assume one developer.

### Phase 0 — Unbreak the build *(under a day)*
- Remove `@opennextjs/cloudflare` from `package.json` and the `cf:*` scripts; regenerate `pnpm-lock.yaml`. Right now `--frozen-lockfile` fails, which means **CI and any deploy fails before compiling** (§2.5).
- Add `.env.example` (both quick-starts currently open with `cp .env.example .env`, and the file doesn't exist).
- Delete the empty `lib/ai/` directory and the stray `lib/db/migrations/meta/meta/`.

### Phase 1 — Close the security holes *(2–3 days)*
Do this before any real client data goes in. In severity order:
1. Authenticate the form webhook: per-provider signing secret, drop the `deduped` flag from the response, add rate limiting (§2.1).
2. Add a `canView` gate to the lead and contact detail pages (§2.2) — today any agent can read any client's NRIC by URL.
3. Switch the PDPA export route from `getCurrentDbUser` to a check that also enforces `active` and `deletedAt` (§2.3).
4. Fix the image-delete guard and add auth to `listPropertyImages` (§2.4).

### Phase 2 — Neon → Supabase *(1–2 days)*
Do the database *before* auth: it's the smaller change and it unlocks transactions, which Phase 4 needs.
1. Create the Supabase project in Singapore; run `pnpm db:migrate` then `pnpm seed` against it.
2. Rewrite `lib/db/client.ts` for `postgres-js` (pooler URL, `prepare: false`). **This is the only file that changes** — verified: no other file imports `@neondatabase/serverless`.
3. Verify every screen against seeded data, then cut over.

### Phase 3 — Clerk → Better Auth *(3–5 days)*
1. Add Better Auth's tables via a new Drizzle migration, mapped onto your existing `users` table so `role`/`active` keep working.
2. Write `lib/auth/betterauth-provider.ts` against the existing `interface.ts`; flip `active-provider.ts`. **Nothing in `server/` or `components/` changes** — they only call `requireDbUser()`/`getCurrentDbUser()`.
3. Rewrite `middleware.ts`, `provider-components.tsx`, and the sign-in/sign-up pages.
4. **Choose magic links over passwords.** For 5 internal staff it's less code, no password reset flow to build, and more secure. It does require working email — so wire up Resend properly (`lib/email/` is currently never imported by anything).
5. Re-link identities: `users.externalAuthId` holds Clerk IDs today. `lib/auth/sync.ts:40` already matches on email at first login, which handles this — verify it.
6. Keep Clerk live until the new path is verified end to end.

### Phase 4 — Correctness, now that you have transactions *(2–3 days)*
- Wrap `qualifyLead` in a transaction with a conditional update (§3) — stops double-clicks creating duplicate contacts.
- Replace round-robin with one `UPDATE ... SET last_index = last_index + 1 RETURNING last_index` (§3).
- Fix the dedup logic to exclude converted and disqualified leads — **this is silently losing you returning-customer enquiries today** (§3).
- Fix CSV import: strip thousands separators in `rm()`, lowercase the `interest` enum, correct the error row numbers (§3). Right now a budget typed as `1,200,000` rejects the entire row.
- Fix `budgetMin`/`budgetMax` units in `intakeSchema` — a landing page posting `800000` currently stores RM 8,000.

### Phase 5 — Operations *(2 days)*
- GitHub Actions cron for `purge-stale-leads` — **your 24-month PDPA retention isn't actually running anywhere today** (§4).
- Zod schema validating env vars at boot, so a missing `S3_BUCKET` fails loudly at deploy instead of on first upload.
- Either initialise Sentry properly or remove it — as configured, setting `SENTRY_DSN` makes error reporting *worse* than leaving it unset (§4).
- Add the missing indexes, especially partial indexes on `created_at WHERE deleted_at IS NULL` (§4).

### Phase 6 — Decide hosting
Pick Path A or B above. Revisit self-hosting in 6 months against the §3 triggers.

### Ongoing
Backfill tests on the pure functions — `parseCsv`, `rm()`, `rbac.ts`, `formatMYR`. Four of the bugs in Phase 4 would have been caught by about 30 lines of table-driven tests, and `pnpm test` currently exits non-zero because there are no test files at all.

---

## 5. One-line summary

Supabase free in Singapore now, connected via plain `postgres-js` so the exit stays cheap; Better Auth instead of Auth.js; and spend your cost-cutting attention on app hosting, not the database — because Vercel Hobby isn't licensed for what you're using it for, and that's the only line item here that can actually bite you.

---

## Sources

- [Auth.js is now part of Better Auth](https://better-auth.com/blog/authjs-joins-better-auth) · [Auth.js security update: July 2026](https://better-auth.com/blog/security-update-july-2026)
- [Supabase free tier limits 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) · [Supabase available regions](https://supabase.com/docs/guides/platform/regions)
- [Vercel pricing and free tier limits 2026](https://supadrop.host/blog/vercel-pricing-free-tier-limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cheapest cloud VPS 2026 — Hetzner vs DigitalOcean vs Vultr vs Linode](https://cloudmart.dev/blog/cheapest-vps-2026) · [Vultr plans and regions](https://vpscomparehub.com/providers/vultr/)
