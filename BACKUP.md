# Database Backup & Restore

The Supabase free plan includes **no backups**. Their own documentation tells free-plan users to export regularly. This is how.

Two things make this urgent for this codebase specifically:

- The app contains **hard-delete code paths** — `hardDeleteContact` (PDPA erasure), `purgeContact`, and `scripts/purge-stale-leads.ts`. These genuinely remove rows.
- There are **no automated tests**, so those are the least-verified routines in the project.

Without a backup, one bug in a purge routine is unrecoverable.

---

## What this does

| | |
|---|---|
| **Schedule** | Daily, 02:00 Malaysia time (18:00 UTC) |
| **Method** | `pg_dump` in custom format → AES-256 encrypted → Cloudflare R2 |
| **Retention** | 90 days, older files pruned automatically |
| **Verification** | Monthly automated restore into a throwaway database, with row-count assertions |
| **Cost** | RM 0 — GitHub Actions free minutes, and the dumps sit inside R2's free 10 GB |

Measured on a database holding 10,000 listings, 30,000 leads, 15,000 contacts, 150,000 activity notes and 80,000 photo records:

- Database size: **126 MB**
- Dump: **11 MB** (custom format is already compressed)
- Encrypted: **9.8 MB**
- Restore time: **~2 seconds**, with all row counts, 46 indexes and 11 foreign keys intact

So a full daily backup for a year is roughly 3.6 GB — comfortably inside R2's free tier.

---

## Files

```
.github/workflows/db-backup.yml         daily dump → encrypt → upload
.github/workflows/db-restore-test.yml   monthly restore verification
scripts/backup-db.sh                    same job on a server you run yourself (Option C/D)
scripts/verify-restore.sh               manual restore check
```

Copy `.github/workflows/` into the repository root and `scripts/` alongside the existing scripts folder.

---

## Setup

### 1. Create an R2 bucket for backups

In the Cloudflare dashboard, create a bucket — e.g. `propertyagent-backups`. Keep it **separate from the property-photos bucket** so a token leak on the app side cannot reach the backups.

Create an **R2 API token** scoped to *only* that bucket, with Object Read & Write.

### 2. Get the DIRECT database connection string

In Supabase: Project Settings → Database → Connection string.

**Use the direct connection on port 5432, not the pooler on 6543.** `pg_dump` cannot run through transaction-mode pooling — this is the single most common reason these workflows fail on first run.

### 3. Choose a passphrase

Generate one and **store it in a password manager**, not only in GitHub:

```bash
openssl rand -base64 32
```

If you lose this passphrase, every backup you hold is unreadable. This is the single point of failure in the whole scheme.

### 4. Add the GitHub secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SUPABASE_DIRECT_URL` | `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres` |
| `BACKUP_PASSPHRASE` | the passphrase from step 3 |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BACKUP_BUCKET` | `propertyagent-backups` |
| `R2_ACCESS_KEY_ID` | from the R2 token |
| `R2_SECRET_ACCESS_KEY` | from the R2 token |

### 5. Run it by hand once

Actions → *Database backup* → **Run workflow**. Then Actions → *Restore test* → **Run workflow**.

**Do not consider this done until the restore test has passed.** A backup you have not restored is a hope, not a backup.

---

## Restoring for real

When you actually need it — a bad purge, a mistaken migration, a lost project:

```bash
# 1. List what you have
aws s3 ls s3://propertyagent-backups/db/ --endpoint-url "$R2_ENDPOINT"

# 2. Fetch the one you want (the newest BEFORE the damage)
aws s3 cp s3://propertyagent-backups/db/crm-2026-08-10T18-00-00Z.dump.gpg . \
  --endpoint-url "$R2_ENDPOINT"

# 3. Decrypt
gpg --decrypt --output crm.dump crm-2026-08-10T18-00-00Z.dump.gpg

# 4. Restore into a NEW database first — never straight over production
createdb crm_recovered
psql -d crm_recovered -c "DROP SCHEMA IF EXISTS public CASCADE;"
pg_restore -d crm_recovered --no-owner --no-privileges --exit-on-error crm.dump

# 5. Check it looks right, THEN repoint the app
psql -d crm_recovered -c "SELECT count(*) FROM contacts;"
```

Restore to a new database and inspect it before switching. Restoring over a live database when you are already in trouble is how a recoverable incident becomes a permanent one.

---

## Known gotchas

**The pooler.** Port 6543 will not work for `pg_dump`. Use 5432.

**`pg_dump` version.** It must be the same major version as the server or newer, which is why the workflow installs `postgresql-client-17` rather than using whatever the runner ships.

**`CREATE SCHEMA public`.** Because the dump is scoped with `--schema=public`, it contains its own `CREATE SCHEMA public` statement. Restoring into a fresh database — which already has one — makes `pg_restore` exit non-zero. Both scripts drop the default schema first. (Found by testing, not by reading docs.)

**Silent empty dumps.** A dump that "succeeds" but produces a 2 KB file is the classic failure — usually wrong credentials or an empty schema. Both the workflow and the shell script abort below 50 KB, and the restore test asserts the contacts table is non-empty.

**Photos are not in here.** Property images live in R2, not the database. R2 does not delete objects on its own, so they are durable — but they are not versioned. If you want protection against accidental deletion, enable object versioning on the photos bucket. The `documents` table holds only pointers, so a database restore without the matching photos leaves broken image links.

---

## If you later move to your own server (Option C or D)

Use `scripts/backup-db.sh` from cron instead of GitHub Actions:

```bash
sudo cp scripts/backup-db.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup-db.sh
sudo install -m 600 /dev/null /etc/crm-backup.env    # then fill in the variables
sudo crontab -e
# 0 2 * * * /usr/local/bin/backup-db.sh >> /var/log/crm-backup.log 2>&1
```

Two additions that matter once nobody else is watching the server:

- **Send the backup somewhere else.** A backup on the same machine as the database is not a backup. R2 is free and outside your server — keep using it. (Note: if data residency is the reason you self-hosted in Malaysia, R2 is not a valid destination — use a Malaysian object store instead.)
- **Alert on failure.** Cron failing silently for three months is the standard way this ends. Have the script ping a healthcheck service, or send yourself mail on non-zero exit.

---

## Checklist

- [ ] R2 backup bucket created, separate from the photos bucket
- [ ] R2 token scoped to that bucket only
- [ ] Direct connection string (5432) confirmed working
- [ ] Passphrase generated and stored in a password manager
- [ ] Six GitHub secrets added
- [ ] Backup workflow run manually and produced a file
- [ ] **Restore test run manually and passed**
- [ ] Calendar reminder to check the workflow is still green — quarterly
