# Security review — 29 Aug 2026

A follow-up to `SECURITY_REVIEW.md` (12 Aug) and `HARDENING_PLAN.md` (25 Aug), covering
what actually shipped since, plus the surfaces added since those were written: the Meta
webhook, the Cloudflare Workers deployment, and bulk lead deletion.

Scope: code and configuration in this repo, read on 29 Aug 2026. Not covered: the
Supabase and Cloudflare account configuration itself, Clerk's dashboard settings, or
anything that can only be checked by running the app against production.

## Verdict

The application code is in good shape and better than most at this stage. Injection,
authorisation, upload handling and the public endpoints have all been thought about
properly, and in several places the reasoning is written down next to the code.

The remaining risk is almost entirely in **configuration, not code** — and one item is
serious enough to fix before any real client data arrives.

## 1. Clerk is running on TEST keys in production — High

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = pk_test_...
    CLERK_SECRET_KEY                  = sk_test_...

The deployed Worker is authenticating real sessions against a Clerk **development**
instance. This was item 6 of the August review and is still open.

Why it matters:

- Development instances are not intended for production and Clerk documents them as
  such. Expect weaker session guarantees and shared development domains.
- Development instances are subject to low user caps and rate limits — sign-in can
  simply stop working once a handful of agents are on it.
- MFA and the stricter session controls live on production instances.

This is the single highest-value fix on the list, and it is configuration rather than
code: create a Clerk production instance, take the `pk_live_` / `sk_live_` pair, set
them as Worker secrets AND in the build environment (`NEXT_PUBLIC_*` is baked into the
client bundle at build time, so GitHub's secret must change too), and enable MFA for
admin accounts.

Note this also affects who can sign in: a production Clerk instance starts with no
users, so accounts have to be re-created or migrated.

## 2. Uploaded files are trusted for their declared MIME type — Medium

`server/properties/images.ts` and `server/deal-documents/actions.ts` both check
`file.type` against an allowlist and cap the size (8 MB and 15 MB). Filenames are
sanitised and the storage key is a UUID, so path traversal and collisions are handled.

But `file.type` is supplied by the client and can be anything. A file claiming
`image/jpeg` that actually contains HTML is stored with that content type and later
served from a signed R2 URL with it.

The blast radius is limited — R2 serves from `*.r2.cloudflarestorage.com`, a different
origin from the app, so such a page cannot read the app's cookies or session — but it
would still be an attacker-controlled page served from a URL your agency handed out.

Two cheap mitigations, either is enough:

- Serve documents with `Content-Disposition: attachment` on the signed URL, so the
  browser downloads rather than renders. Right answer for the deal-documents path,
  which accepts PDFs and Word files that nobody needs rendered inline.
- Check magic bytes rather than the declared type for images (JPEG `FF D8 FF`, PNG
  `89 50 4E 47`, WebP `RIFF....WEBP`). A dozen lines, no dependency.

## 3. No request body size limit on the public lead endpoint — Low/Medium

`app/api/public/leads/route.ts` calls `req.json()` with no size guard. The rate limiter
runs first, which is the important half, and the Workers runtime caps both request size
and CPU time, so a single huge body gets killed by the platform rather than taking the
app down.

Still worth a `content-length` check before parsing — it turns a platform-level kill
into a clean 413, and costs nothing.

## 4. The Meta verify token appears in request logs — Low

Meta's subscription handshake arrives as a GET with `hub.verify_token` in the query
string, and Workers Logs records full request URLs. The token is therefore sitting in
Cloudflare observability.

Low impact on its own: knowing the verify token lets someone complete a webhook
handshake, but only if they also control the callback URL registered on the app, which
requires access to the Meta app itself. Worth knowing rather than worth panicking about.
If it bothers you, rotate `META_VERIFY_TOKEN` after any period where log access was
broader than it should be. It cannot be moved out of the query string — Meta defines
that shape.

The same is NOT true of the App Secret or the page token: those never appear in a URL.

## 5. Confirm the rate limiter actually runs in production — verify, do not assume

`lib/rate-limit.ts` fails open by design — a broken limiter allows the request rather
than dropping a paid lead. That is the right call, and the public endpoint logs when it
happens. But it means a limiter that is silently not working looks exactly like one that
is.

Locally it always fails open, because `RATE_LIMIT_LEADS` and `RATE_LIMIT_WEBHOOKS` are
Workers ratelimit bindings declared in `wrangler.jsonc` and `next dev` has no such
runtime. In production the bindings exist and it should work.

Verify it once, from outside: POST to `/api/public/leads` with a bad API key more than
10 times in a minute and confirm you get 429s, and check the logs contain no
"rate limiter is failing open" message. Until that is done, treat the public endpoint as
unprotected.

## 6. Still open from the August review

- **No Content-Security-Policy.** `next.config.mjs` explains the deliberate omission —
  Clerk's scripts and R2 image URLs would need allowing, and a wrong policy breaks
  sign-in. The path forward is `Content-Security-Policy-Report-Only` first, then
  enforce. The other five headers are in place and correct.
- **No MFA on admin accounts.** Blocked on item 1: MFA needs a production Clerk
  instance.
- **No audit trail for reads.** Writes are logged; nobody records who *looked* at a
  client's record. Matters more once staff turnover starts.
- **Dependency advisories.** Run `pnpm audit` — this review did not check the current
  tree. `drizzle-orm` is now 0.45.2, so the SQL injection advisory that prompted the
  August item is resolved.

## What is right, and should stay right

Worth writing down so a later change does not quietly undo it:

- **SQL injection: not a realistic risk.** Every raw `sql` template interpolates values
  as parameters, including the dynamic ones in `stale.ts`, `pass-on.ts` and `funnel.ts`.
  No string concatenation into SQL anywhere.
- **Authorisation is enforced in the data layer**, not just the UI — `ownershipFilter`,
  `assertCanEdit`, `assertRole`. Hiding a button is not a permission; this codebase
  knows that.
- **The PDPA export endpoint is the strictest thing in the codebase**, and deliberately
  so: `requireDbUser` rather than `getCurrentDbUser`, so deactivated and soft-deleted
  admins are rejected, then an explicit admin check.
- **Webhook signatures are verified with a constant-time comparison** and an unconfigured
  provider is rejected rather than trusted. Fails closed.
- **CORS is an allowlist, not `*`**, and with nothing configured no CORS header is sent
  at all — server-to-server posts still work, browser JS does not.
- **The rate limiter runs before the API key check**, so the endpoint cannot be used to
  brute-force keys.
- **Deletes are soft**, and bulk deletion is admin-only and logged with a count and an
  actor.
- **Secrets are not in the repo.** `.env` is gitignored, Worker secrets are set through
  wrangler, and GitHub holds only the three the build needs.
- **The Meta page token is a system-user token that does not expire**, holding
  `leads_retrieval` and no more than it needs. It cannot silently die in 60 days and
  take lead capture with it.

## Suggested order

1. **Clerk production instance + MFA for admins.** Everything else is smaller than this.
2. **Verify the rate limiter in production** — one curl loop, ten minutes.
3. **`Content-Disposition: attachment` on document signed URLs.** Small, closes item 2.
4. **`pnpm audit`** and update anything with a known advisory.
5. **CSP in report-only mode**, watch the reports for a week, then enforce.
6. Body size guard on the public endpoint.

Items 1 and 2 are the two that would matter in an incident. The rest is hygiene.

## What this review cannot tell you

Whether the accounts around the code are sound: who has access to the Cloudflare and
Supabase dashboards, whether those logins have MFA, whether the database password has
been rotated since it was last shared, and whether backups restore. `HARDENING_PLAN.md`
covers that ground and is still the right checklist for it.
