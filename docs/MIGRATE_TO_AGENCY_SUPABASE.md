# Runbook — move to the agency Supabase project

Written 29 Aug 2026, not yet executed. Picks up where the session stopped.

Moving off the personal Supabase project onto one owned by the agency:

    from  a project under the personal account (aws-0-ap-southeast-1 pooler)
    to    Lanthorn Agency CRM, ref `dgiwxuwjvyfkpxhsicrs`
          org: lanthornagency@gmail.com's Org, Singapore, nano, free tier

Do this BEFORE real client data exists. Right now the only rows are test data, so
nothing needs migrating — the new database can simply start empty.

## The step everyone misses

Production does NOT read `DATABASE_URL`.

Cloudflare Workers cannot open a TLS socket to Supabase directly (postgres-js hangs in
the handshake and the request is cancelled after 30s), so the Worker talks to
**Hyperdrive**, which holds the real pooled connections. `wrangler.jsonc` binds
Hyperdrive id `6db9c58c11e5432bafde0b1c292d099f`, and THAT config holds the credentials.

Change the `DATABASE_URL` secret alone and production carries on talking to the old
database, quite happily, with no error anywhere. See `lib/db/client.ts` — it falls back
to `DATABASE_URL` only outside the Workers runtime.

## Steps

### 1. Connection strings

Supabase dashboard -> **Connect**. Take both:

    DATABASE_URL          port 6543   transaction pooler   the app
    DIRECT_DATABASE_URL   port 5432   session pooler       migrations

Both use the same host and user; only the port differs:

    host  aws-0-ap-southeast-1.pooler.supabase.com
    user  postgres.dgiwxuwjvyfkpxhsicrs
    db    postgres

Percent-encode the password in the URI if it contains special characters.

Migrations need 5432: DDL and advisory locks do not work through transaction-mode
pooling. Do NOT use the `db.<ref>.supabase.co` direct host — it is IPv6-only unless the
IPv4 add-on is bought, and fails with ENOTFOUND on a normal network.

**IPv6 note, changed since the comments in `lib/db/client.ts` were written.** Supabase
now says the TRANSACTION pooler (6543) "uses IPv6 by default" and needs the paid IPv4
add-on to be reachable from an IPv4-only network, while the SESSION pooler (5432) is
"IPv4 proxied for free".

Production does not care — Hyperdrive does the connecting and Cloudflare has IPv6.
Local development might: if `pnpm dev` cannot reach 6543, set `DATABASE_URL` to the
**5432** string locally as well. Session-mode pooling is less efficient under
concurrency but fine for one developer, and `prepare: false` in `lib/db/client.ts` is
safe either way. Keep the Worker/Hyperdrive side on 6543.

### 2. Create the schema

Put both values in `.env`, then:

    pnpm db:migrate

All 14 migrations (0000 to 0013) should apply. The dashboard's "Last migration" stops
saying "No migrations".

### 3. Repoint Hyperdrive — the one that switches production

Cloudflare dashboard -> Storage & databases -> **Hyperdrive** -> config
`6db9c58c11e5432bafde0b1c292d099f` -> edit the connection to the new project's **6543**
string.

### 4. The other credentials

    pnpm exec wrangler secret put DATABASE_URL     # new 6543 string

GitHub -> Settings -> Secrets and variables -> Actions:

    SUPABASE_DIRECT_URL    # new 5432 string

`.github/workflows/db-backup.yml` uses that secret. Miss it and backups keep dumping the
OLD database — a backup of the wrong thing is worse than no backup, because it looks
like cover.

### 5. Bootstrap the first admin

Before signing in — see "What has to be recreated by hand" below for why:

    pnpm bootstrap:admin you@agency.com "Your Name"

### 6. Deploy and verify

Run the deploy workflow, then load production `/leads`. It should be **empty** — that
absence is the confirmation you are on the new database. Sign in, create a lead, check
it appears.

## What has to be recreated by hand

Rows, not schema, so migrations will not bring them:

- **Users — investigated 29 Aug, and the answer was "there is no bootstrap".**

  `syncCurrentUser` (`lib/auth/sync.ts`) matches a Clerk identity to a staff row by
  `external_auth_id`, then by email, and failing both inserts the row as
  `role: "agent", active: false`. On an empty database the first person to sign in
  therefore lands on `/pending` — and there is no admin in existence to approve them.
  Locked out, exactly as feared. `pnpm seed` was the only escape and it DELETES every
  row, so it cannot be used against a database that matters.

  **Fixed by `scripts/bootstrap-admin.ts`.** Run it against the new database BEFORE
  signing in:

      pnpm bootstrap:admin you@agency.com "Your Name"

  It inserts one active admin with a placeholder `external_auth_id`; signing in with
  that email makes `syncCurrentUser` adopt the row by email and attach the real Clerk
  id. Non-destructive, and it refuses to run once any user exists — a bootstrap, not a
  back door for granting yourself admin later.

  Order matters when moving Clerk at the same time: bootstrap with the email you will
  use on the **production** Clerk instance, not the test one.
- **The Met1 Residence project.**
- **The lead source mapping**: provider `meta`, form id `1613980423612055`, name
  "met1 campaign", project Met1 Residence. `/lead-sources`, two minutes.
- **Campaign spend rows**, if any were entered.

## Note on the first sign-in after bootstrapping

`pnpm bootstrap:admin` works by creating a row that your Clerk login then adopts by
email. As of `f339890` that adoption requires the address to be VERIFIED at the auth
provider — linking an unverified address to an existing staff row would hand over that
row's role, so it is refused and logged.

Bootstrap with an address you can actually receive mail on, and complete Clerk's email
verification before expecting admin access.

## Do the Clerk move at the same time

`SECURITY_REVIEW_2026-08-29.md` item 1: production is running on Clerk **test** keys
(`pk_test_` / `sk_test_`), which the browser console warns about on every page load —
development instances have strict usage limits and are not meant for production.

Fixing that also means recreating accounts, because a Clerk production instance starts
empty. Doing both moves together is one disruption instead of two.

Clerk keys go in three places, not one:

    pnpm exec wrangler secret put CLERK_SECRET_KEY                    # sk_live_...
    pnpm exec wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY   # pk_live_...
    GitHub secret NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY                   # pk_live_...

The GitHub one matters because `NEXT_PUBLIC_*` is baked into the client bundle at BUILD
time; the Worker secret alone will not change what the browser loads.

Enable MFA on admin accounts once the production instance exists — it is not available
on development instances, which is half the reason to move.

## Afterwards

- Delete the old Supabase project once the new one has run for a few days and a backup
  has been taken and restore-tested. Not before.
- Take a backup and run the restore test (`HARDENING_PLAN.md` session 4). "Last backup:
  No backups" on a production database is the state you do not want to be in when you
  need one.
