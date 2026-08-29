# Meta Lead Ads — setup, ids, and debugging

Working notes for the Facebook Lead Ads integration. Written 2026-08-28 after a long
debugging session; the point is that the next person (or the next session) does not
repeat it.

## Identifiers

| Thing | Id |
|---|---|
| App — Property Agent CRM | `3056637414682639` |
| Page — Lanthorn Realty | `1227222843814833` |
| Business portfolio — Lanthorn Realty Agency | `1579354273044733` |
| System user — PropertyAgent CRM | `122094079779468392` |
| Test form (working) | `4598404903712128` |

## Environment

    WEBHOOK_SECRET_META      App Secret. Verifies x-hub-signature-256 on POSTs.
    META_VERIFY_TOKEN        Any random string. Must match the Meta webhook config.
    META_PAGE_ACCESS_TOKEN   System-user token. Fetches lead answers from the Graph API.
    META_PAGE_ID             Optional. Pins one Page when the token can see several.
    META_GRAPH_VERSION       Optional. Defaults to v21.0.

`.env` values may be quoted; everything that reads them strips quotes. Note that
`pnpm dev` only loads `.env` at boot — after editing it, restart the dev server or the
old values stay live.

## Token

Use a SYSTEM USER token, not a user or Page token: system-user tokens do not expire,
so lead ingestion cannot silently die 60 days after setup.

Generate at: Business settings -> Users -> System users -> PropertyAgent CRM ->
Generate token. Required scopes:

    leads_retrieval          fetch lead answers          REQUIRED at runtime
    pages_show_list          resolve the Page
    pages_read_engagement    read Page metadata
    pages_manage_ads         list lead forms             tooling only, not runtime
    pages_manage_metadata    manage webhook subscriptions

Only `leads_retrieval` is needed by the running webhook. `pages_manage_ads` is needed
by `scripts/replay-meta-lead.mjs --list` and `scripts/find-meta-form.mjs`.

Check any token with:

    node scripts/meta-token-info.mjs

It prints type, validity, expiry and every scope, including granular scopes — Meta can
grant a permission for specific Pages only, so a token can list `leads_retrieval` and
still be refused for a particular Page.

## Leads Access Manager

Separate from app installation and from the webhook subscription, and easy to miss.
Business settings -> Integrations -> Leads Access -> Lanthorn Realty:

- CRMs tab: Property Agent CRM must be assigned.
- People tab: the SYSTEM USER must be assigned too. It is the identity behind the
  token, and without lead access the Graph API refuses lead data even though the
  system user is a Page admin.

Permission changes do NOT apply retroactively to an already-issued token. Regenerate
the token after changing access.

## Webhook

Configured at `developers.facebook.com/apps/3056637414682639/webhooks/` — object
`Page`, field `leadgen`. It is NOT on the app Dashboard; the use-case view hides it,
so go to that URL directly.

Callback URL is `<public origin>/api/webhooks/forms/meta`, verify token is
`META_VERIFY_TOKEN`.

The handshake is a GET with `hub.mode=subscribe`; the handler returns `hub.challenge`
as `text/plain`. Test it directly before touching the Meta UI — if this does not
return the challenge, Meta's "Verify and save" cannot succeed either:

    curl.exe "https://<host>/api/webhooks/forms/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=alive"

Must print exactly `alive`. Do not build the token with a PowerShell `-replace`
one-liner — that mangled it once and cost an hour. Paste the literal value.

## Production

Deployed to Cloudflare Workers at:

    https://propertyagent-crm.lanthornrealty.workers.dev

The Meta webhook callback points at
`https://propertyagent-crm.lanthornrealty.workers.dev/api/webhooks/forms/meta`
and does NOT need changing again. The tunnel section below is only for working on
the webhook locally.

Deploys run from GitHub Actions, not a laptop: `.github/workflows/deploy-cloudflare.yml`,
manual dispatch, with a `dry_run` input that builds and tests without deploying.
`next build` fails on Windows with EPERM creating the symlinks for `.next/standalone`,
so a local `pnpm cf:deploy` will not work from this machine — use the workflow.

Runtime secrets live on the Worker, not in the repo and not in GitHub:

    pnpm exec wrangler secret list
    pnpm exec wrangler secret put <NAME>

As of 29 Aug 2026 all twelve are set, including WEBHOOK_SECRET_META,
META_VERIFY_TOKEN and META_PAGE_ACCESS_TOKEN. GitHub holds only the three the BUILD
needs: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.

Note `NEXT_PUBLIC_*` values are baked into the client bundle at build time, so they
come from the build environment, not from Worker secrets.

## Local development tunnel

`cloudflared` is installed at `C:\Program Files (x86)\cloudflared\cloudflared.exe` and
is NOT on PATH. Run it by full path, bound to IPv4:

    & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:3000

Use `127.0.0.1`, not `localhost`: cloudflared resolves `localhost` to `[::1]` and
Next binds IPv4, which produces a 502 that looks like the app is down when it is not.

Quick tunnels get a NEW random hostname every start, and the Meta callback URL must be
updated each time. Leave the window open. Error 1033 means the tunnel process is gone;
502 means the tunnel is up but nothing is listening on 3000.

A permanent hostname (ngrok's free static domain, or a named Cloudflare tunnel) would
remove this whole class of problem.

## Scripts

    node scripts/meta-token-info.mjs              introspect the token and its scopes
    node scripts/replay-meta-lead.mjs --list      list forms and their leads
    node scripts/replay-meta-lead.mjs --form <id> replay the newest lead on one form
    node scripts/replay-meta-lead.mjs <lead_id>   replay one specific lead
    node scripts/find-meta-form.mjs               probe candidate ids for a lead form

`replay-meta-lead.mjs` builds the exact envelope Meta posts, signs it with
`WEBHOOK_SECRET_META`, and POSTs it to the local endpoint. It bypasses Meta's delivery
ONLY — signature verification, the Graph API fetch and `createLeadFromIntake` all run
for real, so a 200 means the whole ingestion path works. Useful because Meta's realtime
delivery to a dev tunnel frequently sits on "Pending" and never arrives.

Response codes: 200 accepted; 403 signature rejected (wrong App Secret); 503 Graph
fetch failed (token cannot read the lead).

## Creating a form you can actually test with

Two traps, both of which cost hours on 2026-08-28.

**1. "Create lead" in the Lead Ads Testing Tool is useless for a form with validation.**
It fills every field with the literal string `<test lead: dummy data for phone_number>`,
which is not a phone number, so intake rejects it — correctly. Use **Test form** instead:
Instant Forms -> select the form -> **Test form** (a blue TEXT LINK at the top right of
the Form preview panel, not a button). That opens the real form; fill it with real values
and submit. The result is a genuine lead with genuine answers.

**2. Do not type anything into Form settings -> Field names.**
The greyed-out words `email`, `full_name`, `phone_number` are the DEFAULTS, shown as
placeholder text. Typing there renames the field. Doing this by mistake produced a form
whose questions were literally named `+60173388077` and `rooney_liong@hotmail.com`, so
the mapper found no phone and no name and every lead was rejected. Leave all three blank.

Build the form with the PREBUILT contact fields (Choose the type of information you need
-> Email, Full name, Phone number). Those arrive as `email`, `full_name`, `phone_number`,
which is what `PHONE_KEYS`/`EMAIL_KEYS`/`NAME_KEYS` in `server/leads/meta-map.ts` expect.
The "Add question" section is for extra questions only.

Only ONE test lead can exist per form at a time. To test again, go to the Lead Ads
Testing Tool, select the form and click **Delete lead**, then submit through **Test form**
again. Without deleting first, Test form will not accept another submission.

Also note: a form becomes locked once published — the detail panel offers only Download
and Boost, no Edit. Duplicate it or create a new one. Creating a copy appears to archive
the originals, and archived forms cannot receive new test leads.

Verified working end to end on 2026-08-28 with form `4598404903712128`: a Test form
submission of "Rodney Liong" / MY+60 / 163373357 arrived as `+60163373357`, was
normalised by `toE164`, and created a lead.

## Known gaps

- Realtime delivery from Meta has never been observed to arrive. Track status stays
  "Pending". Unconfirmed cause; the app is unpublished, and Meta warns that production
  data is not delivered to unpublished apps. Publishing needs a privacy policy URL and
  App Review. Until then `scripts/replay-meta-lead.mjs` is how leads get in during
  development — it exercises the real path apart from Meta's delivery hop.
- No `lead_form_sources` row exists yet for form `4598404903712128`. Add one
  (provider `meta`, `external_form_id` = that id, pointing at the right project) or
  leads ingest unattached to any project. Until then every delivery logs
  "Meta lead form is not mapped to a project" at info level, which is expected.
- Rate limiting is inert in local dev: `RATE_LIMIT_WEBHOOKS` is backed by Cloudflare
  KV, which plain `next dev` does not provide, so it throws and fails open. Harmless
  locally, must work in production.
- `getFunnel` (server/reports/funnel.ts) times out against Supabase — statement
  timeout 57014, /dashboard taking 10-23s. Indexes look correct; suspect the
  transaction-mode pooler (port 6543) plus a large concurrent Promise.all. Unrelated
  to lead ingestion.
