# Where things stand — 10 August 2026

## Done

**Phase 0 — build.** Dependency lockfile fixed (`@opennextjs/cloudflare` 1.20.2, wrangler 4, Next 15.5.23). `pnpm install --frozen-lockfile` works, so CI and deploys can install. Added `.env.example`, `wrangler.jsonc`, `open-next.config.ts`.

**Phase 1 — security.** Four verified holes closed:
- Form webhook now HMAC-verified per provider, **fails closed** if no secret configured
- `canView` gates on lead/contact detail pages — agents can no longer read other agents' clients by URL
- Soft-deleted users no longer authenticate anywhere; PDPA export uses `requireDbUser`
- Image-delete guard fails closed; `listPropertyImages` requires auth

Also: `deduped` removed from both public endpoints (was a phone-number lookup oracle), consent no longer manufactured, CORS allow-listed, Sentry replaced with structured logging that actually works.

**Phase 2 — Supabase.** Live on `ap-southeast-1` (Singapore). Migrations 0000–0003 applied. Measured **8ms warm queries** — the database is healthy and close.

**Phase 4 — correctness.** Both race conditions fixed and proven under concurrency (8 simultaneous Qualify clicks → exactly 1 contact; 40 concurrent assignments → 10/10/10/10). Repeat-customer enquiries no longer silently discarded. CSV import rewritten — Facebook and Google exports now import without editing.

**Extras.** Env validation at boot, PDPA purge cron, timezone fix, performance indexes, N+1 fixes on dashboard and reports, `pnpm db:check` diagnostic. **82 tests, up from 0.**

---

## Next, in order

### 1. Commit and push (do first)
Nothing since the review is committed, and the local backup folders are deleted.
```bash
git add -A && git status && git commit -m "..." && git push
```
`.env` is gitignored and has never been tracked — verified.

### 2. Step 4 — backups ⚠️ the last launch blocker
Workflows are already in `.github/workflows/`. Needs six GitHub secrets:

| Secret | Value |
|---|---|
| `SUPABASE_DIRECT_URL` | **session pooler**, port 5432 — not `db.<ref>.supabase.co` |
| `BACKUP_PASSPHRASE` | `openssl rand -base64 32` → password manager |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BACKUP_BUCKET` | e.g. `propertyagent-backups` (separate from photos) |
| `R2_ACCESS_KEY_ID` | R2 token scoped to that bucket only |
| `R2_SECRET_ACCESS_KEY` | " |

Then Actions → *Database backup* → Run workflow, then *Restore test* → Run workflow.
**Done means the restore test passed**, not that the backup ran.

Why it matters: Supabase free has no backups (its own dashboard says "LAST BACKUP — No backups"), and the app contains hard-delete purge routines.

### 3. Step 5 — settle Cloudflare vs Vercel
```bash
npx wrangler login
npx wrangler r2 bucket create propertyagent-crm-opennext-cache
pnpm cf:preview
```
Five checks: builds under 10 MB · a page renders · image uploads · `POST /api/public/leads` works · sign-in works.
All pass → Cloudflare, RM 31/mo. Any fail → Vercel Pro, RM 102/mo.

### 4. Step 6 — Clerk production keys
Clerk **development** keys don't work on a real domain. Create a Production instance, add DNS, copy the new keys into your hosting platform's secrets.

---

## Open items, not blocking

- **Rotate the database password** before Step 5 — it was shared in chat. Cheap now, a maintenance task once deployed.
- **Delete the Neon project** — revokes the old credential.
- **`db_cluster-26-07-2026@09-04-40.backup.gz`** in the project folder is an unencrypted database dump. Gitignored now, but move or delete it.
- **Decide the PDPA residency question** with an adviser. If Malaysia-only is required, that triggers a move to Option D — better known before client records accumulate in Singapore, since a transfer can't be undone.
- **Clerk free has no MFA.** Your admin account can export every client's NRIC. Accept for now; Clerk Pro (USD 20/mo) or Better Auth is the fix when it matters.
- **Seed data is still in the database.** `pnpm seed` deletes everything first — never run it once real data exists. Clear the seed staff before go-live, and note round-robin only assigns to users with role `agent`.
- **Resize images on upload** — raw phone photos are 3–5 MB; at 8 per listing that's 10× the storage.
- **README and DEPLOYMENT still describe the app as "Phase 0, no auth or UI yet".**

---

## Things worth remembering

- **App connects on port 6543** (transaction pooler), **migrations on 5432** (session pooler). `db.<ref>.supabase.co` is IPv6-only without the paid add-on — that was the `ENOTFOUND`.
- **Pool size is 10 in dev, 1 in production.** `max: 1` in dev was what made the dashboard take 22 seconds.
- **`pnpm db:check`** times connection, warm queries, parallel vs sequential — use it before blaming the app.
- **Won deals are matched on `deal_stages.is_won`, not the stage name.** If you add a won stage through the UI, set the flag or reporting won't count it.
