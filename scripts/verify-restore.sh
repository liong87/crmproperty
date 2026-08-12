#!/usr/bin/env bash
# Download the newest backup and prove it restores into a scratch database.
# Run this by hand the first time, then monthly. Never trust a backup you
# have not restored.
#
#   ./verify-restore.sh                 # uses the newest file in R2
#   ./verify-restore.sh crm-2026-08-10T18-00-00Z.dump.gpg
#
# Needs the same environment as backup-db.sh, plus a local PostgreSQL
# you can create a scratch database on (LOCAL_PG defaults to a local socket).

set -euo pipefail
[ -f /etc/crm-backup.env ] && . /etc/crm-backup.env
: "${BACKUP_PASSPHRASE:?}"; : "${R2_ENDPOINT:?}"; : "${R2_BUCKET:?}"
export AWS_DEFAULT_REGION=auto
LOCAL_PG=${LOCAL_PG:-"postgres://postgres@localhost:5432/postgres"}
SCRATCH=${SCRATCH:-crm_restore_check}

WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT

KEY=${1:-}
if [ -z "$KEY" ]; then
  KEY=$(aws s3 ls "s3://$R2_BUCKET/db/" --endpoint-url "$R2_ENDPOINT" | sort | tail -1 | awk '{print $4}')
fi
echo "verifying: $KEY"

aws s3 cp "s3://$R2_BUCKET/db/$KEY" "$WORK/b.gpg" --endpoint-url "$R2_ENDPOINT" --only-show-errors
printf '%s' "$BACKUP_PASSPHRASE" > "$WORK/pp"
gpg --batch --yes --decrypt --passphrase-file "$WORK/pp" -o "$WORK/b.dump" "$WORK/b.gpg"

psql "$LOCAL_PG" -q -c "DROP DATABASE IF EXISTS $SCRATCH;" -c "CREATE DATABASE $SCRATCH;"
BASE=${LOCAL_PG%/*}
# The dump carries its own CREATE SCHEMA public. Drop the default one first,
# otherwise pg_restore reports an error and exits non-zero.
psql "$BASE/$SCRATCH" -q -c "DROP SCHEMA IF EXISTS public CASCADE;"
pg_restore -d "$BASE/$SCRATCH" --no-owner --no-privileges --exit-on-error "$WORK/b.dump"

echo "--- row counts in the restored copy ---"
psql "$BASE/$SCRATCH" -t -A -F': ' -c "
  SELECT 'properties', count(*) FROM properties
  UNION ALL SELECT 'leads',      count(*) FROM leads
  UNION ALL SELECT 'contacts',   count(*) FROM contacts
  UNION ALL SELECT 'activities', count(*) FROM activities
  UNION ALL SELECT 'documents',  count(*) FROM documents;"

CONTACTS=$(psql "$BASE/$SCRATCH" -t -A -c "SELECT count(*) FROM contacts;")
if [ "$CONTACTS" -eq 0 ]; then
  echo "FAIL: restored database has no contacts. This backup is not usable." >&2
  exit 1
fi

psql "$LOCAL_PG" -q -c "DROP DATABASE $SCRATCH;"
echo "PASS: $KEY restores cleanly with $CONTACTS contacts."
