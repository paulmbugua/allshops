#!/usr/bin/env sh
set -eu

: "${1:?Usage: restore-test.sh BACKUP_FILE TARGET_DATABASE}"
: "${2:?Usage: restore-test.sh BACKUP_FILE TARGET_DATABASE}"
BACKUP_FILE="$1"
TARGET_DATABASE="$2"
case "$TARGET_DATABASE" in *test*|*restore*|*staging*) ;; *) printf 'Target must contain test, restore, or staging.\n' >&2; exit 2;; esac
case "$TARGET_DATABASE" in *[!a-zA-Z0-9_]*) printf 'Unsafe target database name.\n' >&2; exit 2;; esac
test -f "$BACKUP_FILE"
test -f "$BACKUP_FILE.sha256"
backup_dir="$(CDPATH= cd -- "$(dirname -- "$BACKUP_FILE")" && pwd)"
backup_name="$(basename "$BACKUP_FILE")"
(cd "$backup_dir" && sha256sum --check "$backup_name.sha256")

ROOT="${INFRA_ROOT:-/opt/infrastructure/postgres}"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_ADMIN_PASSWORD:?missing from .env}"

exists="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$TARGET_DATABASE'")"
test "$exists" = "1" || {
  printf 'Create an isolated target database first; refusing to guess ownership.\n' >&2
  exit 1
}

docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$TARGET_DATABASE' AND pid <> pg_backend_pid()" >/dev/null
docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  dropdb -U infra_admin "$TARGET_DATABASE"
docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  createdb -U infra_admin "$TARGET_DATABASE"
docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  pg_restore -U infra_admin -d "$TARGET_DATABASE" --no-owner --exit-on-error < "$BACKUP_FILE"

tables="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d "$TARGET_DATABASE" -Atc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'")"
test "$tables" -gt 0
printf 'Restore test passed: database=%s public_tables=%s\n' "$TARGET_DATABASE" "$tables"
