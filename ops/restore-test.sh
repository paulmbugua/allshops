#!/usr/bin/env sh
set -eu

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${DATABASE_URL:?DATABASE_URL identifies the source and is required for safety comparison}"

if [ "$RESTORE_DATABASE_URL" = "$DATABASE_URL" ]; then
  printf 'Refusing to restore over the source database.\n' >&2
  exit 1
fi
RESTORE_NAME="$(printf '%s' "$RESTORE_DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
case "$RESTORE_NAME" in
  *test*|*restore*|*staging*) ;;
  *) printf 'Restore database name must contain test, restore, or staging.\n' >&2; exit 1 ;;
esac

test -f "$BACKUP_FILE"
test -f "$BACKUP_FILE.sha256"
sha256sum --check "$BACKUP_FILE.sha256"
pg_restore --list "$BACKUP_FILE" >/dev/null
pg_restore --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner "$BACKUP_FILE"

for table in organizations users sales stock_movements inventory_balances subscriptions billing_records; do
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT to_regclass('public.$table') IS NOT NULL" | grep -qx t
done
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT json_build_object('organizations', (SELECT count(*) FROM organizations), 'users', (SELECT count(*) FROM users), 'sales', (SELECT count(*) FROM sales), 'stockMovements', (SELECT count(*) FROM stock_movements), 'subscriptions', (SELECT count(*) FROM subscriptions));"
printf 'Restore verification passed for isolated database: %s\n' "$RESTORE_NAME"
