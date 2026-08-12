# Phase 0 + Phase 1 changes — build fix and security

**Verified:** `pnpm install --frozen-lockfile` succeeds · `tsc --noEmit` clean · `next build` succeeds (25 routes) · `vitest run` 22 tests passing.

Copy these files over the same paths in your repo, then **delete `lib/monitoring/sentry-provider.ts`** and run `pnpm install`.

---

## Phase 0 — the build

**`package.json` / `pnpm-lock.yaml`** — `@opennextjs/cloudflare` was pinned at `^0.3.10`, whose transitive dependency resolved to a pre-release registry (`pkg.pr.new`) returning 403, and it was missing from the lockfile entirely. So `pnpm install --frozen-lockfile` — what CI and every deploy platform runs — failed before compiling.

Upgraded to `@opennextjs/cloudflare@1.20.2` and `wrangler@4.120.0`, which resolve cleanly from npm. That required `next@15.5.23` (the adapter's peer range starts at 15.5.21); you were on 15.5.20.

**`.env.example`** — didn't exist, though both README and DEPLOYMENT open with `cp .env.example .env`. Generated from your `.env` with values stripped, plus the new webhook secrets.

---

## Option B — Cloudflare Workers

**`wrangler.jsonc`** and **`open-next.config.ts`** — neither existed, so `pnpm cf:deploy` could never have worked. Added with `nodejs_compat` (needed for `Buffer` in the image upload and for `postgres-js`), an R2 bucket binding for the Next.js incremental cache, and observability enabled.

Before the first deploy:

```bash
npx wrangler r2 bucket create propertyagent-crm-opennext-cache
pnpm cf:preview     # builds and runs it locally under Workers
```

That preview is the 5-point test we discussed — if it serves pages, talks to the database, and accepts a lead POST, Option B is confirmed.

---

## Phase 1 — security

### R1 (Critical) — the form webhook was open to the internet

`app/api/webhooks/forms/[provider]/route.ts` accepted any POST. Anyone could create leads, trigger WhatsApp notifications to your agents, and **write a PDPA consent record for a person who never consented**.

- New `lib/webhooks/verify.ts`: HMAC-SHA256 verification using Web Crypto only, so it runs unchanged on Node and on Workers.
- Per-provider secrets via `WEBHOOK_SECRET_<PROVIDER>`. **Fails closed** — a provider with no configured secret is rejected, not trusted.
- Tally and Typeform verified by signature; `generic` by an `x-webhook-secret` header.
- Constant-time comparison, because `===` on a secret leaks length and position through timing.
- **Removed `deduped` from the response.** This was an unauthenticated lookup oracle: anyone could test whether a phone number already belonged to one of your clients.
- **Consent is no longer assumed.** `consentGiven` was hardcoded `true` for Tally and Typeform. It now reads the form's actual consent answer and defaults to *false*. A manufactured consent record is worse than none.
- Added a **`googleads` provider** while I was in here — Google's lead-form webhook, verified via the `google_key` in the payload, carrying `lead_id` through for dedup. Errors return 4xx so Google doesn't retry a payload that can never succeed.

### R2 (Critical) — any agent could read any client's NRIC by URL

`app/(dashboard)/contacts/[id]/page.tsx` and `leads/[id]/page.tsx` fetched by ID with no ownership check — `canEdit` was computed but only used to hide buttons. An agent could visit `/contacts/<any-uuid>` and read name, phone, email, budget, nationality, occupation, **ID type and NRIC/passport number**, private notes, and the full activity timeline.

Added `canView` gates. They call `notFound()` rather than returning 403, so the page doesn't confirm the record exists.

### R3 (High) — offboarded admins kept PDPA export access

`deleteUser` deliberately doesn't revoke the identity at the auth provider, so a sacked administrator's session still worked — and the export route used `getCurrentDbUser`, which checked neither `active` nor `deletedAt`.

- `getCurrentDbUser` now excludes soft-deleted users, which closes this across every caller at once.
- The export route uses `requireDbUser` (active *and* not deleted) instead.
- Added a durable audit line when an export happens. Bulk PII leaving the system shouldn't be silent.

### R4 (High) — image deletion skipped its permission check

`server/properties/images.ts` had `if (property) assertCanEdit(...)`. Because `documents.entityId` is polymorphic and `getPropertyById` filters soft-deleted rows, a null lookup **skipped the guard entirely** — any authenticated user could permanently destroy files in R2, including documents attached to contacts or leads.

- Fails closed: no resolvable parent property means no permission.
- Rejects documents whose `entityType` isn't `properties`.
- Ignores already-deleted rows, so a double delete can't re-issue the storage call.
- Reordered so the DB row is soft-deleted *before* the storage object. A failure now leaves an orphaned file (harmless) instead of a live row pointing at a missing object (a broken listing).
- **`listPropertyImages` had no auth check at all** — and since the file is `"use server"`, every export is a callable endpoint. It now requires an active user and validates the UUID.

### Also fixed

**CORS was `Access-Control-Allow-Origin: *`** on the public lead endpoint. Now an allow-list via `PUBLIC_LEAD_ALLOWED_ORIGINS`; empty means no CORS header, which blocks browser JS while leaving server-to-server posts (Make, Zapier, Google Ads) working.

**`deduped` removed from the public lead response too** — same oracle problem, and that key is embedded in public landing pages by design.

**API key comparison** is now constant-time and splits on the first colon only. A key containing `:` previously broke the parser silently.

---

## Monitoring — replaced, not patched

`lib/monitoring/sentry-provider.ts` called `require("@sentry/nextjs")` against an SDK that was **never initialised** (no `sentry.*.config.ts`, no `withSentryConfig`), so every event was dropped. Worse, the `console.error` fallback was skipped whenever `SENTRY_DSN` was set — **turning Sentry on made error reporting worse.** A bare `require()` is also fragile in a Workers bundle.

Replaced with `lib/monitoring/console-provider.ts`: structured single-line JSON, captured and searchable by Cloudflare Workers Observability (enabled in `wrangler.jsonc`). Expanded the redaction list to cover `ownerName`, `ownerPhone`, `notes`, `body`, tokens and secrets, and it no longer serialises arbitrary error properties — which in this codebase can carry a whole row of client data.

`@sentry/nextjs` removed from dependencies. That also shrinks the Worker bundle, which matters for the 10 MB limit. Delete `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` from your `.env`.

If you want a real error tracker later, add a provider beside this one and change one line in `lib/monitoring/index.ts`.

---

## Tests — `pnpm test` now works

There were zero test files, so `vitest run` exited non-zero on a clean checkout. Added `vitest.config.ts` and **22 tests** covering the security-critical pure functions: constant-time comparison (including the length-mismatch and multi-byte cases), HMAC against a known-answer vector, fail-closed secret loading, and the API-key parser including the colon bug.

---

## What to do next

1. Copy these files in, delete `lib/monitoring/sentry-provider.ts`, run `pnpm install`.
2. Generate webhook secrets: `openssl rand -base64 32` — one per provider you use. **Any provider without a secret will now be rejected**, so set these before pointing a form at the endpoint.
3. Create the cache bucket and run `pnpm cf:preview` to settle the Option B question.
4. Next up, in order: Neon → Supabase (`lib/db/client.ts` only), then Clerk → Better Auth, then the race conditions and CSV import bugs.

Given your two-week start, I'd get the Supabase migration and the backup workflow done next — those are what stand between you and holding real client data.
