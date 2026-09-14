#!/usr/bin/env sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/var/backups/allshops}"
MINIMUM_BACKUP_BYTES="${MINIMUM_BACKUP_BYTES:-1024}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%u)"
MONTH_DAY="$(date -u +%d)"

mkdir -p "$BACKUP_DIRECTORY/daily" "$BACKUP_DIRECTORY/weekly" "$BACKUP_DIRECTORY/monthly"
TARGET="$BACKUP_DIRECTORY/daily/allshops-$STAMP.dump"

DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://([^@]+@)?([^/:?]+).*#\2#')"
DB_NAME="$(printf '%s' "$DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
printf 'Creating AllShops backup: host=%s database=%s timestamp=%s\n' "$DB_HOST" "$DB_NAME" "$STAMP"

umask 077
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --no-owner --file="$TARGET"
test -f "$TARGET"
SIZE="$(wc -c < "$TARGET" | tr -d ' ')"
if [ "$SIZE" -lt "$MINIMUM_BACKUP_BYTES" ]; then
  printf 'Backup is unexpectedly small: %s bytes\n' "$SIZE" >&2
  exit 1
fi
pg_restore --list "$TARGET" >/dev/null
sha256sum "$TARGET" > "$TARGET.sha256"
sha256sum --check "$TARGET.sha256"

if [ "$DAY" = "7" ]; then cp -p "$TARGET" "$BACKUP_DIRECTORY/weekly/"; cp -p "$TARGET.sha256" "$BACKUP_DIRECTORY/weekly/"; fi
if [ "$MONTH_DAY" = "01" ]; then cp -p "$TARGET" "$BACKUP_DIRECTORY/monthly/"; cp -p "$TARGET.sha256" "$BACKUP_DIRECTORY/monthly/"; fi

find "$BACKUP_DIRECTORY/daily" -type f -mtime +7 -delete
find "$BACKUP_DIRECTORY/weekly" -type f -mtime +28 -delete
find "$BACKUP_DIRECTORY/monthly" -type f -mtime +93 -delete
printf 'Backup verified: %s (%s bytes)\n' "$TARGET" "$SIZE"
