# Restoring the CRM database

**Read the whole page before typing anything.** Restoring overwrites live data. There is
no undo beyond the backup you are restoring from.

If you are here because the CRM is down but the data is fine — a bad deploy, a Worker
error, an expired key — **you do not need this page.** Roll back the deployment instead
(see "Not a data problem" at the end). Restoring a database to fix an application problem
loses every record created since the backup, for nothing.

---

## 0. Before you touch anything

Answer these two questions out loud. They decide everything that follows.

**What exactly is wrong?** "Some leads look wrong" and "the database is gone" need
different responses. If you cannot name what is broken, stop and look first — a restore
is not a diagnostic.

**When did it start?** You will restore to the newest backup taken *before* that moment.
Backups run nightly at **02:00 Malaysia time**. Anything entered between that backup and
now will be lost, so the answer determines how much work the team has to redo.

> **Only 7 nightly backups are kept.** If the problem started more than a week ago there
> is no backup from before it. See `.github/workflows/db-backup.yml` (`KEEP`) if you want
> that number raised — the storage cost is negligible.

**Then tell the team to stop entering data.** Anything typed during a restore is
overwritten by it.

---

## 1. What you need

| Thing | Where it is |
|---|---|
| The encrypted dumps | Cloudflare R2, the backup bucket, under `db/` |
| `BACKUP_PASSPHRASE` | GitHub → repo → Settings → Secrets → Actions. **See the warning below.** |
| R2 credentials | Same place: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BACKUP_BUCKET` |
| The database URL | Supabase → Project Settings → Database → **direct connection, port 5432**. Not the pooler on 6543 — `pg_restore` cannot run through transaction pooling. |
| `psql` and `pg_restore` | **Version 17 or newer.** Supabase runs 17; a version-16 client aborts with a version mismatch. |

> ### The single point of failure
>
> **GitHub Secrets cannot be read back — only overwritten.** If `BACKUP_PASSPHRASE` exists
> nowhere else, then every backup you hold is permanently undecryptable the moment you
> lose access to that GitHub account, and you will not discover this until the day you
> need it.
>
> **Store that passphrase somewhere else today** — a password manager, or a sealed
> envelope. Not in this repository, not in the CRM, and not on the same account as the
> backups. Verify it works by doing the drill in section 5 while nothing is wrong.

---

## 2. Get the backup

```bash
export AWS_ACCESS_KEY_ID=...        # R2_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=...    # R2_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=auto
R2_ENDPOINT=...                     # https://<account>.r2.cloudflarestorage.com
R2_BUCKET=...                       # the backup bucket

# What is available. Filenames carry the dump time in UTC — Malaysia is UTC+8, so
# crm-2026-09-02T18-00-00Z is 02:00 on 3 September local.
aws s3 ls "s3://$R2_BUCKET/db/" --endpoint-url "$R2_ENDPOINT"

# Fetch the one you chose in step 0.
aws s3 cp "s3://$R2_BUCKET/db/crm-2026-09-02T18-00-00Z.dump.gpg" . \
  --endpoint-url "$R2_ENDPOINT"

# Decrypt. You will be prompted for BACKUP_PASSPHRASE.
gpg --decrypt --output restore.dump crm-2026-09-02T18-00-00Z.dump.gpg
```

---

## 3. Check it before you trust it

Never restore a dump you have not looked inside. This takes ten seconds and has caught a
silent failure before.

```bash
pg_restore --list restore.dump | grep -E "TABLE DATA public (users|leads|contacts|deals)"
```

Four lines means the dump has the tables that matter. No output means the file is not
what you think it is — **stop, and try the previous night's dump.**

---

## 4. Restore

**Two situations. Do not confuse them.**

### 4a. Some data is wrong, the database works

Restore into a **scratch database first**, look at what is in there, and copy across only
what you need. Do not overwrite production to recover a handful of rows.

```bash
createdb -h localhost -U postgres scratch
pg_restore -h localhost -U postgres -d scratch --no-owner --no-privileges restore.dump
psql -h localhost -U postgres -d scratch -c "SELECT count(*) FROM leads;"
```

Then move the specific rows across by hand. Slower, and the right call almost every time.

### 4b. Production is genuinely lost

> **STOP. This replaces the live database.** Everything entered since the backup is gone.
> Do not run it because a page is broken — see the last section.

```bash
# Prove you have the right target. Read the output before continuing.
psql "$DATABASE_URL" -c "SELECT current_database(), (SELECT count(*) FROM users) AS users;"

# One last safety net: dump what is there now, however broken it looks.
pg_dump "$DATABASE_URL" --format=custom --schema=public --no-owner --no-privileges \
  --file="pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"

# Replace the schema, then restore. --exit-on-error stops at the first failure rather
# than leaving a half-restored database that looks fine.
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --dbname "$DATABASE_URL" --no-owner --no-privileges --exit-on-error restore.dump
```

### Then check, in this order

```bash
psql "$DATABASE_URL" -c "
  SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'leads', count(*) FROM leads
  UNION ALL SELECT 'contacts', count(*) FROM contacts
  UNION ALL SELECT 'deals', count(*) FROM deals;"
```

`users` at zero means nobody can sign in — the restore failed, do not stop here.

Then, in the app: sign in, open a lead, open a deal, load `/reports`.

**Finally, check the migration state.** If the backup predates a migration that has since
run, the schema is older than the code:

```bash
pnpm db:migrate
```

---

## 5. The drill — do this now, not during an incident

Once a quarter, and today:

1. Run **Restore test** from the GitHub Actions tab (**Run workflow**). It restores the
   newest dump into a scratch PostgreSQL and asserts the schema and that `users` is not
   empty. Green means the backup chain works.
2. Decrypt one dump by hand using the passphrase **from wherever you stored it outside
   GitHub**. This is the step that proves you can still read your own backups.
3. Time it. How long from "we need to restore" to "the CRM works"? That number is your
   real recovery time, and guessing it is how people are surprised.

---

## Not a data problem

If the data is fine and the app is broken, **do not restore.**

- **A bad deploy** — Cloudflare dashboard → Workers & Pages → propertyagent-crm →
  Deployments → roll back to the previous version. Seconds, and loses nothing.
- **A failed migration** — the schema changed but the data is intact. Fixing forward with
  a new migration is almost always safer than restoring; migration `0023` was resolved
  this way. Drizzle migrations are forward-only: there is no `db:rollback`.
- **Nobody can sign in** — that is Clerk or Cloudflare Access, not the database. Check
  the Access policy and the Clerk keys first.
