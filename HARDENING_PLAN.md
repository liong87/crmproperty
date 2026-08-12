# Hardening plan — ordered runbook

Companion to `SECURITY_REVIEW.md`. That document explains *why*; this one is what to
do, in order, with the commands.

Work through it top to bottom. Each session is self-contained — stop at the end of
any session and you are in a consistent state.

Before you start:

```powershell
cd C:\Users\weichong.liong\Desktop\Claude\Propertyagent\crm
$env:CLOUDFLARE_API_TOKEN="<your current token>"
```

---

## Session 1 — Rotate every exposed credential (45 min)

**Do this before anything else.** Four live credentials have been shared in a chat
transcript. Until they are rotated, nothing else on this list matters.

Do the whole session in one sitting: half-rotated credentials cause failures that
look like bugs.

### 1.1 Supabase database password

1. Supabase → your project → **Settings → Database → Reset database password**
2. Generate a strong password there and **save it in your password manager**.
   It must be different from your CRM login password.
3. Update every place that holds it — there are **five**, and the fifth is the one
   people miss:

   | Where | How |
   |---|---|
   | `.env` — `DATABASE_URL` (port 6543) | edit the file |
   | `.env` — `DIRECT_DATABASE_URL` (port 5432) | edit the file |
   | Worker secret `DATABASE_URL` | `npx wrangler secret put DATABASE_URL` |
   | GitHub secret `SUPABASE_DIRECT_URL` | repo → Settings → Secrets → Actions |
   | **Hyperdrive configuration** | see below |

4. Hyperdrive keeps its **own copy** of the connection string. Update it:

   Cloudflare → Storage & databases → **Postgres & MySQL (Hyperdrive)** →
   `propertyagent-db` → **Settings** → update the connection string with the new
   password → save.

   Leave the port as **5432** and keep caching disabled.

☐ Done when the dashboard still loads after a redeploy.

### 1.2 Cloudflare API token

1. Cloudflare → Manage account → **Account API tokens** → `wandering-snowflake-b4e9`
   → `...` → **Roll**
2. Copy the new value
3. Update the GitHub secret `CLOUDFLARE_API_TOKEN`
4. Update your PowerShell session: `$env:CLOUDFLARE_API_TOKEN="<new value>"`

### 1.3 R2 photos token

1. R2 → API tokens → the photos token → **Roll**
2. ```powershell
   npx wrangler secret put S3_ACCESS_KEY_ID
   npx wrangler secret put S3_SECRET_ACCESS_KEY
   ```

### 1.4 Your CRM login password

Clerk dashboard → Users → your account → set a new password. **Different** from the
database password.

### 1.5 Redeploy and verify

Actions → *Deploy to Cloudflare Workers* → Run workflow, `dry_run` unchecked.

Then check:

- ☐ `/dashboard` loads (new database password works end to end)
- ☐ A property photo displays (new R2 credentials work)
- ☐ You can sign in with the new password

---

## Session 2 — Close the public endpoint (30 min, no code)

Everything here is Cloudflare dashboard work.

### 2.1 Rate-limit the lead endpoint

Cloudflare → your account → **Security** → **Rate limiting rules** → Create rule:

- **Name:** `public-leads`
- **If incoming requests match:** `URI Path` `equals` `/api/public/leads`
- **Rate:** 10 requests per 1 minute
- **Counting characteristic:** IP address
- **Action:** Block, for 1 minute

Repeat for `/api/webhooks/` using `URI Path` `starts with`, at 30 per minute.

☐ Done when a burst of requests returns 429.

> Rate limiting rules on `workers.dev` subdomains are limited. If the option is not
> available, this becomes another reason to move to a real domain (Session 5) —
> where these rules apply properly.

### 2.2 Confirm the new API key took effect

```powershell
npx wrangler secret list
```

☐ `PUBLIC_LEAD_API_KEYS` is listed.

Then confirm the old key is dead — this should return **401**:

```powershell
curl.exe -X POST "https://propertyagent-crm.lanthornrealty.workers.dev/api/public/leads" `
  -H "x-api-key: devkey123" -H "Content-Type: application/json" `
  -d '{\"name\":\"test\",\"phone\":\"+60123456789\"}'
```

☐ Returns `{"ok":false,"error":"Invalid API key"}`.

Also remove the old value from `.env` so local runs do not resurrect it.

---

## Session 3 — Dependencies and quick code fixes (2 h)

### 3.1 Low-risk dependency updates

```powershell
pnpm update sharp postcss nanoid
pnpm typecheck
pnpm test
```

☐ 82 tests pass. Commit, deploy, spot-check a photo upload (that is what `sharp`
touches).

### 3.2 Security response headers

Add to `next.config.mjs` — no compatibility risk:

```js
async headers() {
  return [{
    source: "/:path*",
    headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ],
  }];
}
```

☐ Verify with your browser's Network tab, or:
`curl.exe -I https://propertyagent-crm.lanthornrealty.workers.dev`

### 3.3 Fix the activity permission gap

`server/activities/actions.ts` authenticates but never authorises. Load the parent
lead or contact and call `assertCanEdit(me, entity.assignedTo)` before writing, as
`server/leads/actions.ts` does.

☐ Done when an agent cannot log activity against another agent's lead.

### 3.4 Shorten signed photo URLs

`lib/storage/r2-provider.ts`: change `expiresInSeconds = 3600` to `900`.

☐ Photos still display after deploy.

*(I can make 3.2, 3.3 and 3.4 for you — say the word.)*

---

## Session 4 — Backups, before any real client data (1 h)

**This is the gate.** Do not put real client records in until the restore test is
green.

### 4.1 Resolve the duplicate buckets

**Decision: keep `landthoncrm-backups`.** Delete `propertyagent-backups`, and make
sure the GitHub secret `R2_BACKUP_BUCKET` is exactly:

```
landthoncrm-backups
```

Both `db-backup.yml` and `db-restore-test.yml` read that secret, so the two stay in
step automatically — the only requirement is that the name matches the surviving
bucket exactly. A mismatch is silent: backups upload happily to one place while the
restore test looks in another and finds nothing.

☐ One bucket, `R2_BACKUP_BUCKET` matches it.

### 4.2 Check the backup token has Read

The backup token was created with **Write** only. The restore test must *list and
download*, so it needs **Object Read & Write**.

R2 → API tokens → the backups token → Edit → set Object Read & Write.

☐ Permissions include read.

### 4.3 Run the backup

Actions → **Database backup** → Run workflow.

☐ A `.dump.gpg` file appears in the bucket under `db/`.

### 4.4 Run the restore test — the one that counts

Actions → **Restore test** → Run workflow.

☐ Log shows **"Restore verified."** Not "backup succeeded" — *restore* verified.

> Confirm `BACKUP_PASSPHRASE` is in your password manager. Lose it and every backup
> you hold is permanently unreadable.

---

## Session 5 — Production auth and a real domain (2–3 h)

### 5.1 Buy a domain

Cloudflare → Domains → Register. `lanthornrealty.com` was about USD 10/year.

Needed for: Clerk production keys, proper rate-limiting rules, and a URL you can
give agents.

### 5.2 Clerk production instance

1. Clerk dashboard → create a **Production** instance
2. Add your domain; create the DNS records it asks for
3. Update the keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (`pk_live_…`) → **GitHub secret**
     (build-time — a Worker secret alone will not work)
   - `CLERK_SECRET_KEY` (`sk_live_…`) → **Worker secret**
4. Point the Worker at the domain: Workers & Pages → `propertyagent-crm` → Domains
5. Redeploy and re-test sign-in on the real domain

☐ You can sign in at your own domain with production keys.

### 5.3 Tighten the admin surface

- Keep two admins: yourself and one backup
- Everyone else starts as `agent`
- Deactivate the seeded `aisyah@agency.my` account if it still exists — it is an
  active admin whose email anyone could claim at sign-up

---

## Session 6 — The drizzle upgrade (half a day, on a branch)

`drizzle-orm` 0.36.4 has an open SQL-injection advisory; fixed in 0.45.2. Several
minor versions apart, so expect breaking changes.

```powershell
git checkout -b upgrade-drizzle
pnpm add drizzle-orm@latest drizzle-kit@latest
pnpm typecheck        # expect errors — work through them
pnpm test
```

Then exercise the heavy queries by hand: `/reports`, `/pipeline`, `/dashboard`,
lead qualification (it runs in a transaction), and the CSV import.

☐ Typecheck clean, 82 tests pass, those five paths work. Then merge and deploy.

Do this on a branch precisely because it is the one change here that could break the
application.

---

## Session 7 — When you have time

- **Image resize on upload** — 3–5 MB phone photos, eight per listing. Costs storage
  and makes pages slow for agents on mobile data.
- **Read audit trail** — log who viewed which contact. Under the PDPA you may need
  to show this.
- **Content-Security-Policy** — add in report-only mode first; Clerk and signed R2
  URLs both need allowing.
- **Data residency** — get a qualified answer on whether client data may sit in
  Singapore. Better before records accumulate; a transfer cannot be undone.

---

## Quick reference — where each secret lives

Four different places, which is the main source of confusion:

| Secret | `.env` | Worker | GitHub | Hyperdrive |
|---|:--:|:--:|:--:|:--:|
| `DATABASE_URL` | ✓ | ✓ | — | ✓ (its own copy) |
| `DIRECT_DATABASE_URL` | ✓ | — | as `SUPABASE_DIRECT_URL` | — |
| `CLERK_SECRET_KEY` | ✓ | ✓ | — | — |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✓ | ✓ | ✓ (build-time) | — |
| `S3_*` | ✓ | ✓ | — | — |
| `PUBLIC_LEAD_API_KEYS` | ✓ | ✓ | — | — |
| `CLOUDFLARE_API_TOKEN` | — | — | ✓ | — |
| `BACKUP_PASSPHRASE`, `R2_*` | — | — | ✓ | — |

Rules of thumb: `.env` is local development only. Worker secrets are read at request
time. GitHub secrets are used at build and deploy time. Anything `NEXT_PUBLIC_*` is
baked into the browser bundle **at build time** — so it must be a GitHub secret, and
it must never hold anything genuinely secret.
