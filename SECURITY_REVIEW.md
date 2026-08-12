# Security review — PropertyAgent CRM

**Reviewed:** 12 August 2026
**Scope:** application code, access control, public endpoints, secrets handling,
deployment configuration and production dependencies.
**Deployment:** Cloudflare Workers → Hyperdrive → Supabase (Singapore), Clerk auth.

This is a working review against the actual code, not a generic checklist. Items are
ordered by what an attacker would reach first, not by how easy they are to fix.

---

## Summary

The application itself is built defensively, and better than most projects of this
size. Authorisation is enforced server-side rather than in the UI, webhooks fail
closed, secrets never touch the repository, and several classes of bug have already
been anticipated and commented in the code.

The exposure is concentrated in **operational** matters — credentials that have been
shared, a dependency with a known SQL-injection advisory, and the absence of rate
limiting — rather than in application logic.

| # | Finding | Severity | Effort |
|---|---|---|---|
| 1 | Credentials disclosed in a chat transcript, still live | **Critical** | 30 min |
| 2 | Password reuse between CRM login and database | **Critical** | included in 1 |
| 3 | `drizzle-orm` 0.36.4 — SQL injection advisory | **High** | 1–3 h |
| 4 | No rate limiting on the public lead endpoint | **High** | 1–2 h |
| 5 | No database backups, and the app hard-deletes | **High** | 45 min |
| 6 | Clerk development keys, no MFA on admin accounts | **High** | 1–2 h |
| 7 | Guessable public API key (`devkey123`) | Medium | fixed — verify |
| 8 | No security response headers | Medium | 30 min |
| 9 | Activity logging lacks an explicit edit check | Medium | 30 min |
| 10 | `sharp`, `postcss`, `nanoid` advisories | Medium | 30 min |
| 11 | Signed photo URLs live for 1 hour | Low | 5 min |
| 12 | No audit trail for reads of client data | Low | half day |

---

## 1. Credentials disclosed in chat — **Critical**

Over the course of setting this up, the following were pasted into a chat
transcript and remain valid:

- The Supabase database password
- The Cloudflare API token (`cfat_…`), scoped to the entire account
- The R2 photos bucket Access Key ID and Secret Access Key
- The CRM login password

The database password alone is enough to read every client record — names, phone
numbers, budgets, identity-card numbers — from anywhere on the internet, because
Supabase's pooler is publicly reachable and protected by that password only.

**Fix — do this before anything else on this list:**

1. Supabase → Settings → Database → **Reset database password**
2. Update `.env` (both `DATABASE_URL` and `DIRECT_DATABASE_URL`), the `DATABASE_URL`
   Worker secret, the `SUPABASE_DIRECT_URL` GitHub secret, **and the Hyperdrive
   configuration** — Hyperdrive stores its own copy of the connection string
3. Cloudflare → Account API tokens → **Roll** the deploy token; update the
   `CLOUDFLARE_API_TOKEN` GitHub secret
4. R2 → the photos token → **Roll**; update `S3_ACCESS_KEY_ID` and
   `S3_SECRET_ACCESS_KEY` Worker secrets
5. Change your Clerk account password

Do all five in one sitting. Half-rotated credentials cause confusing failures.

---

## 2. Password reuse — **Critical**

The CRM login password and the Supabase database password were the same string.
One disclosure therefore compromised both the application and the database beneath
it, and an attacker who obtained either would try the other immediately.

**Fix:** as part of item 1, give each a distinct, randomly generated value. Use a
password manager; neither is a password anyone should be typing from memory.

---

## 3. `drizzle-orm` 0.36.4 — SQL injection advisory — **High**

`GHSA` advisory: *Drizzle ORM has SQL injection via improperly escaped SQL
identifiers* (CWE-89). Affects `<0.45.2`; you are on **0.36.4**.

Your query code uses parameterised builders throughout, which is the usual defence,
but the advisory concerns identifier escaping inside the library itself — below the
level your code controls. A CRM holding identity-card numbers should not be running
a database layer with an open injection advisory.

**Fix:** upgrade to `>=0.45.2`. This spans several minor versions, so expect
breaking changes in the query API. Do it on a branch, run `pnpm typecheck` and
`pnpm test` (82 tests give decent cover), and check `/reports` and `/pipeline`
specifically — they use the most complex queries.

---

## 4. No rate limiting on the public lead endpoint — **High**

`POST /api/public/leads` authenticates with an API key that is, by design, embedded
in a public landing page. Anyone who views source can read it. There is no rate
limit, so that key can be used to insert unlimited leads.

The endpoint is otherwise carefully written — the code comments show a lookup-oracle
bug was already found and closed by removing `deduped` from the response. Rate
limiting is the remaining gap.

Consequences of a flood: your Supabase free tier fills, agents' lists become
unusable, and PDPA consent records are written for people who never consented.

**Fix:** Cloudflare Workers can rate-limit at the edge, in front of your code:

- Add a **Rate limiting rule** in the Cloudflare dashboard for the path
  `/api/public/leads` — for example 10 requests per minute per IP
- The same applies to `/api/webhooks/*`

`TURNSTILE_SECRET_KEY` already exists in `.env.example` but nothing implements it.
Cloudflare Turnstile on the landing-page form is the stronger fix, and it is free.

---

## 5. No backups, and the app hard-deletes — **High**

Supabase's free plan takes no backups. `scripts/purge-stale-leads.ts` and the PDPA
erasure feature both perform genuine hard deletes. The workflows to fix this exist
(`db-backup.yml`, `db-restore-test.yml`) but have never run.

Today this only risks test data. The day real client records go in, a mistaken purge
or a Supabase incident is unrecoverable.

**Fix:** run the backup workflow, then the restore test, and treat a green restore
as the gate for putting real data in. Note the duplicate buckets —
`propertyagent-backups` and `landthoncrm-backups` both exist; keep one and make
`R2_BACKUP_BUCKET` match it, or backups will land where the restore test never looks.

---

## 6. Clerk development keys, and no MFA — **High**

The deployment uses `pk_test_` / `sk_test_` keys against a Clerk **development**
instance. Clerk's own dashboard says these are for internal and test users. Dev
instances have weaker guarantees and are not intended to protect production data.

Separately, Clerk's free tier has no MFA. Your admin account can export every
client's identity-card number through the PDPA panel, protected by a password alone.

**Fix:**

- Create a Clerk **Production** instance, add your domain and DNS records, and
  replace both keys (publishable key at build time in GitHub secrets, secret key as
  a Worker secret)
- Keep admin accounts to the minimum — two is usually right
- When budget allows, Clerk Pro (USD 20/month) adds MFA. For an account that can
  export PII in bulk, that is proportionate

---

## 7. Guessable public API key — Medium *(believed fixed)*

`PUBLIC_LEAD_API_KEYS` was `devkey123:homepage-form`. Trivially guessable, and it
authorises writing to your CRM.

**Status:** replaced with a random key. Verify with
`npx wrangler secret list` that `PUBLIC_LEAD_API_KEYS` is set, and make sure
`.env` no longer carries the old value for local runs.

---

## 8. No security response headers — Medium

`next.config.mjs` sets no security headers. Missing:

- `Strict-Transport-Security` — forces HTTPS on repeat visits
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `frame-ancestors` — stops your CRM being framed for
  clickjacking, which matters because destructive actions are one click away
- `Referrer-Policy` — stops record IDs leaking through the Referer header

**Fix:** add a `headers()` block to `next.config.mjs`. A Content-Security-Policy is
worth adding too, but needs care: Clerk loads scripts from
`*.clerk.accounts.dev`, and photos come from signed R2 URLs. Start with the four
above, which carry no compatibility risk, then add CSP in report-only mode.

---

## 9. Activity writes were gated by a read permission — Medium *(fixed)*

**Correction to the first draft of this review.** I originally reported that
`server/activities/actions.ts` had no authorisation check at all. That was wrong —
it resolves the parent record and calls `canView`. My grep looked for
`assertCanEdit` and missed the different spelling.

The real issue was narrower: `logActivity` and `sendWhatsAppAndLog` are **writes**
gated by `canView`, a **read** permission. For agents the two are equivalent, so
there was no agent-level hole. For managers they differ — `canView` returns true for
every record, while `canEdit` is scoped to their own team — so a manager could log
activity, set follow-ups, or send a WhatsApp message against records outside their
team. All three detail pages already gate the logging form on `canEdit`, so the
server was more permissive than the interface implied.

**Status:** fixed. Both actions now check `canEdit`, matching the UI and every other
action module.

---

## 10. Other dependency advisories — Medium

| Package | Installed | Patched | Note |
|---|---|---|---|
| `sharp` | <0.35.0 | ≥0.35.0 | Inherited libvips CVEs; image processing on untrusted uploads |
| `postcss` | 8.4.31 / 8.5.16 | ≥8.5.23 | Build-time only |
| `nanoid` | 3.3.15 | ≥3.3.17 | Denial of service via infinite loop |

`sharp` matters most — it processes uploaded images, which are attacker-supplied by
definition.

**Fix:** `pnpm update sharp postcss nanoid`, then typecheck, test and redeploy.

---

## 11. Signed photo URLs live for one hour — Low

`lib/storage/r2-provider.ts` signs URLs with `expiresInSeconds = 3600`. A URL
copied from a page — into a chat, an email, a screenshot — grants access to that
photograph for an hour.

**Fix:** reduce to 5–15 minutes. Pages regenerate URLs on load, so nothing breaks.

---

## 12. No audit trail for reads — Low

Writes are captured in the activity timeline, and PDPA exports call
`monitoring.captureMessage`. But an agent viewing 200 contact records leaves no
trace. Under the PDPA you may need to demonstrate who accessed what.

**Fix:** log contact detail views with user, record and timestamp. Worth doing
before the client base grows.

---

## What is already right

Worth stating, because these are the things most projects get wrong:

- **Authorisation is enforced in the data layer.** `ownershipFilter` scopes list
  queries by role, and detail pages call `canView` separately from `canEdit`. The
  comment in `contacts/[id]/page.tsx` shows the "agent opens any contact by URL and
  reads NRIC" hole was found and closed. `notFound()` is returned rather than 403,
  so the page does not confirm a record exists.
- **Webhooks fail closed.** A provider with no configured secret is rejected, not
  waved through — the harder and more correct choice.
- **Constant-time comparison** for API keys and webhook signatures, and the whole
  key list is scanned so response timing does not reveal a key's position.
- **The PDPA export endpoint uses `requireDbUser`**, so deactivated and
  soft-deleted admins are rejected, and it is admin-only with an audit line.
- **Upload validation** checks size (8 MB), MIME type, and sanitises filenames
  before use as a storage key.
- **Soft-deleted users are treated as unauthenticated**, closing the gap where an
  offboarded employee kept a working session.
- **No secrets in the repository.** `.env` is correctly ignored and absent from git
  history; `.env.example` holds only empty placeholders.
- **Backups are encrypted** with AES-256 before reaching R2, and the backup job
  fails if the dump looks suspiciously small.
- **Environment validation at boot** fails a deploy loudly rather than at first use,
  and treats placeholder values as unset.

---

## Suggested order

**Today:** items 1 and 2 — rotate everything, break the password reuse.

**This week:** item 4 (rate limiting — a dashboard rule, no code), item 10
(dependency updates), item 8 (security headers).

**Before real client data:** item 5 (backups with a green restore test), item 6
(Clerk production keys), item 3 (the drizzle upgrade, since it needs testing time).

**When convenient:** items 9, 11 and 12.

---

## One thing this review cannot tell you

Whether client data may reside in Singapore. Supabase's Southeast Asia region is
Singapore, and Hyperdrive adds Cloudflare's network to the path. If Malaysian data
residency is required for your licence or your clients' expectations, that is a
question for a qualified adviser — and better answered before records accumulate,
because a transfer cannot be undone.
