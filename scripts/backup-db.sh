#!/usr/bin/env bash
# Dump, encrypt and upload the CRM database.
#
# Use this on a server you run yourself (Option C or D). For Supabase, the
# GitHub Actions workflow does the same thing without needing a machine.
#
#   Install:  sudo cp backup-db.sh /usr/local/bin/ && sudo chmod +x /usr/local/bin/backup-db.sh
#   Schedule: sudo crontab -e   then add:
#             0 2 * * * /usr/local/bin/backup-db.sh >> /var/log/crm-backup.log 2>&1
#
# Required environment (put these in /etc/crm-backup.env, chmod 600):
#   DATABASE_URL          direct connection, NOT a pooler URL
#   BACKUP_PASSPHRASE     keep a copy in a password manager - without it the backups are waste
#   R2_ENDPOINT           https://<account-id>.r2.cloudflarestorage.com
#   R2_BUCKET             bucket name
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   R2 token with write access to that bucket

set -euo pipefail

[ -f /etc/crm-backup.env ] && . /etc/crm-backup.env
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
export AWS_DEFAULT_REGION=auto

MIN_BYTES=${MIN_BYTES:-51200}      # anything smaller is treated as a failed dump
KEEP_DAYS=${KEEP_DAYS:-90}
STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
DUMP="$WORK/crm-$STAMP.dump"

echo "[$(date -uIs)] starting backup"

# 1. Dump. Custom format so single tables can be restored selectively later.
pg_dump "$DATABASE_URL" \
  --format=custom --schema=public \
  --no-owner --no-privileges \
  --file="$DUMP"

# 2. Sanity check. A tiny dump that "succeeded" is the classic silent failure.
SIZE=$(stat -c%s "$DUMP")
echo "dump size: $SIZE bytes"
if [ "$SIZE" -lt "$MIN_BYTES" ]; then
  echo "ERROR: dump is only $SIZE bytes - not uploading." >&2
  exit 1
fi

# 3. Encrypt. The file contains NRIC and passport numbers.
printf '%s' "$BACKUP_PASSPHRASE" > "$WORK/pp"
gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-file "$WORK/pp" -o "$DUMP.gpg" "$DUMP"

# 4. Upload.
aws s3 cp "$DUMP.gpg" "s3://$R2_BUCKET/db/crm-$STAMP.dump.gpg" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors
echo "uploaded db/crm-$STAMP.dump.gpg"

# 5. Prune anything older than KEEP_DAYS.
CUTOFF=$(date -u -d "-$KEEP_DAYS days" +%Y-%m-%d)
aws s3 ls "s3://$R2_BUCKET/db/" --endpoint-url "$R2_ENDPOINT" \
| awk '{print $4}' | grep -E '^crm-' | while read -r KEY; do
    KEYDATE=${KEY#crm-}; KEYDATE=${KEYDATE:0:10}
    if [[ "$KEYDATE" < "$CUTOFF" ]]; then
      aws s3 rm "s3://$R2_BUCKET/db/$KEY" --endpoint-url "$R2_ENDPOINT" --only-show-errors
      echo "pruned $KEY"
    fi
  done

echo "[$(date -uIs)] backup complete"
