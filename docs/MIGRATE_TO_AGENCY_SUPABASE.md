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

Migrations need 5432: DDL and advisory locks do not work through transaction-mode
pooling. Do NOT use the `db.<ref>.supabase.co` direct host — it is IPv6-only unless the
IPv4 add-on is bought, and fails with ENOTFOUND on a normal network.

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

### 5. Deploy and verify

Run the deploy workflow, then load production `/leads`. It should be **empty** — that
absence is the confirmation you are on the new database. Sign in, create a lead, check
it appears.

## What has to be recreated by hand

Rows, not schema, so migrations will not bring them:

- **Users.** The `users` table is keyed on the Clerk external id. A fresh database has
  none. CHECK HOW THE FIRST ADMIN IS BOOTSTRAPPED before switching, or you will be
  locked out of every admin-only page (`/lead-sources`, `/users`, bulk delete, PDPA
  export). This was flagged and not yet investigated.
- **The Met1 Residence project.**
- **The lead source mapping**: provider `meta`, form id `1613980423612055`, name
  "met1 campaign", project Met1 Residence. `/lead-sources`, two minutes.
- **Campaign spend rows**, if any were entered.

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
