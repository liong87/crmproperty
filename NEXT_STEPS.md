# What You Need To Do — Ordered Runbook

**Target: live in 2 weeks.** Steps 1–4 are the launch blockers. Step 5 decides Option B vs A. Everything after that is polish.

Times are rough and assume no surprises.

---

## Step 1 — Apply the code (15 min)

```bash
cd path/to/crm

# Apply in order. The second patch builds on the first.
# Unzip each and copy the contents over your repo, preserving paths.
#   crm-phase0-phase1.zip  → files under patch/
#   crm-phase2-phase4.zip  → files under patch2/

rm lib/monitoring/sentry-provider.ts     # replaced by console-provider.ts

pnpm install
pnpm typecheck                            # must be clean
pnpm test                                 # must show 53 passing
```

Then edit `.env` and **delete these two lines** — Sentry is gone:

```
SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_DSN=""
```

☐ Done when `pnpm typecheck` and `pnpm test` both pass.

---

## Step 2 — Supabase (30 min)

1. Create a project at supabase.com. **Region: Southeast Asia (Singapore).**
2. Settings → Database → Connection string. You need **both**:

```bash
# .env — the app uses the POOLER on 6543
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

# migrations need the DIRECT connection on 5432
DIRECT_DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

3. Create the schema and load test data:

```bash
pnpm db:migrate
pnpm seed
pnpm dev          # http://localhost:3000
```

**Sign in as `aisyah@agency.my`** — the seed creates that row as admin, and first login links it to your Clerk identity by email, so you get admin access without touching the database.

☐ Done when you can sign in and see seeded leads, contacts and properties.

> **Don't skip the pooler/direct distinction.** Using the pooler for migrations fails on DDL. Using the direct URL for the app exhausts connections under load.

---

## Step 3 — Webhook secrets (15 min)

Any webhook provider without a configured secret is now **rejected**. That's deliberate — but it means an existing Tally form stops working the moment you deploy unless you set this.

```bash
openssl rand -base64 32     # run once per provider you actually use
```

```bash
# .env
WEBHOOK_SECRET_TALLY="..."         # only if you use Tally
WEBHOOK_SECRET_GOOGLEADS="..."     # this is the "key" you paste into Google Ads
WEBHOOK_SECRET_GENERIC="..."       # for Make/Zapier posting to /webhooks/forms/generic

# Your landing page keys — one per page, comma separated "key:slug"
PUBLIC_LEAD_API_KEYS="<random-key>:homepage-form"

# Only needed if a browser posts directly (not needed for server-to-server)
PUBLIC_LEAD_ALLOWED_ORIGINS="https://www.youragency.com.my"
```

☐ Done when every lead source you plan to use has a secret.

---

## Step 4 — Backups ⚠️ DO NOT SKIP (45 min)

The Supabase free plan has **no backups**, and your app contains hard-delete purge routines. This is the one item I'd refuse to launch without.

Use `crm-backup-setup.zip`:

1. Copy `.github/workflows/` into your repo root.
2. In Cloudflare, create an R2 bucket — e.g. `propertyagent-backups`. **Separate from the photos bucket**, so a leaked app token can't reach your backups.
3. Create an R2 API token scoped to that bucket only (Object Read & Write).
4. Generate a passphrase and **save it in a password manager**, not only in GitHub:

```bash
openssl rand -base64 32
```

5. GitHub → Settings → Secrets and variables → Actions. Add six:

| Secret | Value |
|---|---|
| `SUPABASE_DIRECT_URL` | the **5432** connection string from Step 2 |
| `BACKUP_PASSPHRASE` | the passphrase above |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BACKUP_BUCKET` | `propertyagent-backups` |
| `R2_ACCESS_KEY_ID` | from the R2 token |
| `R2_SECRET_ACCESS_KEY` | from the R2 token |

6. Actions → **Database backup** → Run workflow. Confirm a file appears.
7. Actions → **Restore test** → Run workflow. **It must pass.**

☐ Done when the restore test is green. Not when the backup ran — when the *restore* passed.

> If you lose that passphrase, every backup you hold is unreadable. Password manager, today.

---

## Step 5 — Settle Option B vs A (half a day)

This is the test that decides your hosting. Nothing is wasted either way.

```bash
npx wrangler login
npx wrangler r2 bucket create propertyagent-crm-opennext-cache
pnpm cf:preview        # builds for Workers and serves locally
```

Then check five things:

1. ☐ Build completes and reports a worker **under 10 MB compressed**
2. ☐ A dashboard page renders (i.e. it reached Supabase)
3. ☐ A property image uploads and its thumbnail loads
4. ☐ `POST /api/public/leads` with your API key creates a lead
5. ☐ Sign-in works (Clerk on the Workers runtime)

**All five pass → Option B.** Deploy with `pnpm cf:deploy`, RM 31/month.
**Any fail → Option A.** Deploy to Vercel Pro, RM 102/month, and don't look back — you've spent half a day to save RM 855/year, which was worth attempting.

Either way you must set the environment variables on the platform, not just in `.env`:

```bash
# Cloudflare
npx wrangler secret put DATABASE_URL
npx wrangler secret put CLERK_SECRET_KEY
# ...and the rest
```

---

## Step 6 — Clerk production keys (30 min) — easy to miss

Clerk's **development** keys don't work on a real domain. Before launch:

1. Clerk dashboard → create a **Production** instance
2. Add your domain and the DNS records it asks for
3. Copy the production `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` into your hosting platform's environment
4. Re-test sign-in on the real domain

☐ Done when you can sign in at your production URL.

> Clerk free has no MFA. Your admin account can export every client's NRIC. Accept that for now, but know that `CLERK_PRO` (USD 20/mo) or Better Auth is the fix when it matters.

---

## Step 7 — Turn on lead capture (1–2 hours)

**Landing page (your main channel):** point your form at

```
POST https://yourdomain/api/public/leads
Header: x-api-key: <your landing page key>
Body:   { "name": "...", "phone": "+60...", "email": "...",
          "interest": "buy", "consentGiven": true,
          "utmSource": "facebook", "utmMedium": "cpc", "utmCampaign": "mk-launch" }
```

There's a working example in `samples/lead-form.html`.

**Facebook leads, week one:** export CSV from Meta Ads Manager and use the import screen. Column names now match automatically — no editing needed. **Meta deletes leads after ~90 days**, so export at least monthly.

**Google Ads:** paste `WEBHOOK_SECRET_GOOGLEADS` as the *key* in the lead form asset, and set the webhook URL to `https://yourdomain/api/webhooks/forms/googleads`. Google expires leads after **60 days**.

**Meta Business Verification:** start it now if you ever want the real-time API — it takes 1–3 weeks and runs in the background.

☐ Done when a test submission on each live channel appears in the CRM.

---

## Step 8 — Before real client data goes in

☐ **Privacy policy** covering lead data, what you collect, retention period, and how to request deletion. Needed for PDPA, and required if you ever submit for Meta App Review.

☐ **PDPA purge scheduled** — `scripts/purge-stale-leads.ts` exists but nothing runs it, so your 24-month retention rule isn't being applied. *(I can write this workflow — ask.)*

☐ **Resize images on upload** — raw phone photos are 3–5 MB; at 8 per listing that's 10× the storage and slow pages for agents on mobile data. *(I can do this.)*

☐ **Decide the residency question** with a qualified adviser. If Malaysia-only is required, that's the trigger to move to Option D — and better to know before you accumulate client records in Singapore, since a transfer can't be undone.

---

## Suggested two weeks

| | |
|---|---|
| **Days 1–2** | Steps 1–4. Do not move on until the restore test is green. |
| **Days 3–4** | Step 5 (hosting decision), Step 6 (Clerk production). |
| **Days 5–7** | Step 7. Get one real lead through each channel end to end. |
| **Week 2** | Step 8, plus use it yourselves with real listings before agents rely on it. |

Leave the last two days empty. Something will need them.

---

## Still on my list (say the word)

- PDPA purge cron — GitHub Actions, ~15 lines
- Env validation at boot, so a missing `S3_BUCKET` fails at deploy instead of on first upload
- Database indexes on `created_at` (every list query sorts by it, nothing is indexed)
- The timezone bug — follow-up reminders fire at the wrong hour for anyone whose device isn't set to Malaysia
- The N+1 queries on `/reports` and `/dashboard`
- Image resize on upload
- README and DEPLOYMENT rewrite — both still describe the app as "Phase 0, no auth or UI yet"

The first two I'd want done before launch. The rest can wait until you're running.
