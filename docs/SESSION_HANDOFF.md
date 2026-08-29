# Handoff — 2026-08-28

Where the work stands, so a fresh session can pick it up without rediscovering
anything. Read `docs/META_LEAD_ADS.md` alongside this: that file is the durable
reference (ids, tokens, permissions, gotchas); this one is "what happened and what is
next".

## What was achieved

Meta Lead Ads ingestion works end to end, verified with real data on 2026-08-28:

    Meta form submission
      -> webhook receipt POSTed to /api/webhooks/forms/meta
      -> x-hub-signature-256 verified against WEBHOOK_SECRET_META  (App Secret)
      -> lead fetched from the Graph API with META_PAGE_ACCESS_TOKEN
      -> mapMetaLead maps full_name / email / phone_number
      -> toE164 normalises the phone
      -> createLeadFromIntake dedups, assigns an agent, records consent
      -> lead visible at /leads

Proven working: a Test form submission of "Rodney Liong", MY+60, `163373357` arrived as
`+60163373357`, was assigned by round-robin, and appeared in the leads list. Replaying
the same lead a second time deduped rather than creating a duplicate.

Lead source mapping also verified: form `1613980423612055` is mapped to project
"Met1 Residence" with the label "met1 campaign" via the /lead-sources page, and the
"not mapped to a project" log line stops once the mapping exists.

All 213 tests pass across 13 files (`pnpm test`).

## What is NOT proven

Meta has never delivered a lead to us in real time. Track status in the Lead Ads
Testing Tool sits on "Pending" forever. The most likely cause is that the app is
unpublished — Meta warns that production data is not delivered to unpublished apps.
Publishing requires a privacy policy URL and App Review.

This does not block development: `scripts/replay-meta-lead.mjs` reproduces the exact
delivery Meta would make, signed the same way, so everything except Meta's own
delivery hop is exercised for real.

## Deploy — DONE 29 Aug 2026

Live at `https://propertyagent-crm.lanthornrealty.workers.dev`, Meta's callback points
at it, and the tunnel is no longer part of the picture. Kept below for reference.

Two things learned doing it: `pnpm cf:deploy` fails on Windows (EPERM creating the
`.next/standalone` symlinks) so deploys go through `.github/workflows/deploy-cloudflare.yml`
on a Linux runner; and Meta never redisplays a saved verify token, so editing the
callback URL means re-entering the token.

1. Set the Worker secrets. `.env` is NOT deployed; each must be set explicitly:

       wrangler secret list
       wrangler secret put META_VERIFY_TOKEN
       wrangler secret put WEBHOOK_SECRET_META
       wrangler secret put META_PAGE_ACCESS_TOKEN

   A missing META_PAGE_ACCESS_TOKEN shows up as 503 on the webhook; a missing
   META_VERIFY_TOKEN makes Meta's "Verify and save" fail with 403.

2. Deploy:

       pnpm cf:deploy

3. Verify production BEFORE touching the Meta UI — if this does not return `alive`,
   Meta's verification cannot succeed either:

       curl.exe "https://<worker-url>/api/webhooks/forms/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=alive"

4. Point the Meta webhook callback at the production URL
   (`https://<worker-url>/api/webhooks/forms/meta`), same verify token.

5. Test against production — the replay script honours a TARGET env var:

       TARGET=https://<worker-url>/api/webhooks/forms/meta node scripts/replay-meta-lead.mjs --form 1613980423612055

## Open items, roughly by value

- **Publish the Meta app** if real-time delivery is wanted rather than replaying.
  Needs a privacy policy URL (also required by PDPA for a live lead form) and App
  Review.

- **Email-only leads are silently dropped.** `intakeSchema` requires a phone, so a
  lead form that does not ask for one loses every lead it produces — logged at `info`,
  no error, no retry. Whoever builds the ad chooses the fields, so this is a real
  production risk for a paid channel. Two options worth weighing: accept phone OR
  email, and/or surface skipped leads somewhere visible (a dashboard count, a rejected
  list) so the loss is noticed in hours rather than weeks. Note the phone NORMALISER
  is not the problem — `toE164` already handles `0123456789`, `012-345 6789`,
  `60123456789`, `0060...` and foreign `+65...` numbers correctly, with tests.

- **`/dashboard` times out against Supabase.** `getFunnel` (server/reports/funnel.ts)
  hits statement timeout 57014; the page takes 10-23s. Indexes look correct
  (`leads_live_created_idx` is a well-built partial index). Suspect the
  transaction-mode pooler on port 6543 combined with a large concurrent
  `Promise.all` — each query takes a separate pooled connection and they queue.
  Worth re-measuring after deploy, since production goes through Hyperdrive rather
  than the pooler directly. Predates this session; unrelated to lead ingestion.

- **Two phone normalisers exist.** `toE164` in `lib/phone.ts` (Meta path) and
  `toE164My` in `server/leads/csv.ts` (CSV import) solve the same problem with
  different code. Worth collapsing into one so a fix does not have to be made twice.

- **Rate limiting is inert in local dev.** `RATE_LIMIT_WEBHOOKS` is a Workers
  ratelimit binding declared in `wrangler.jsonc`, so it only exists in the Workers
  runtime; `next dev` throws and the code fails open (correct for a webhook). Confirm
  after deploy that the "[rate-limit] threw, request allowed" line is GONE in
  production — if it persists there, the public endpoints are unprotected.

- **Tidy up Meta.** Four lead forms now exist, three of them junk from tonight's
  debugging. Only `1613980423612055` is mapped and current.

## Scripts added this session

All in `scripts/`, all dependency-free Node, all read `.env` directly:

    node scripts/meta-token-info.mjs                 introspect the token: type, validity,
                                                     expiry, every scope, granular scopes
    node scripts/replay-meta-lead.mjs --list         list forms and their leads
    node scripts/replay-meta-lead.mjs --form <id>    replay the newest lead on a form
    node scripts/replay-meta-lead.mjs <lead_id>      replay one specific lead
    node scripts/meta-show-lead.mjs <lead_id>        print the raw field_data Meta holds
    node scripts/find-meta-form.mjs                  probe candidate ids for a lead form

`meta-token-info` and `replay-meta-lead --list` answer most questions in seconds. They
would have saved hours tonight had they existed at the start.

## Unrelated fix made tonight

`tailwind.config.ts` used `require("tailwindcss-animate")` in a file that is ESM
(it has top-level `import`), which broke every Tailwind rebuild with
"ReferenceError: require is not defined". Changed to a proper import.
