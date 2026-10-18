#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-ops/vps-production.env}"
test -f "$ENV_FILE" || { printf 'Missing %s\n' "$ENV_FILE" >&2; exit 1; }
test -f /opt/infrastructure/postgres/.env || {
  printf 'Shared infrastructure is not installed.\n' >&2
  exit 1
}

old_container="$(docker ps -q \
  --filter label=com.docker.compose.project=allshops-production \
  --filter label=com.docker.compose.service=postgres | head -n 1)"
test -n "$old_container" || {
  printf 'No running legacy AllShops PostgreSQL container found.\n' >&2
  exit 1
}

old_database="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$old_container" | sed -n 's/^POSTGRES_DB=//p' | head -n 1)"
old_user="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$old_container" | sed -n 's/^POSTGRES_USER=//p' | head -n 1)"
: "${old_database:=allshops}"
: "${old_user:=allshops}"

DIRECT_DATABASE_URL="$(sed -n 's/^DIRECT_DATABASE_URL=//p' "$ENV_FILE" | tail -n 1)"
DIRECT_DATABASE_URL="$(printf '%s' "$DIRECT_DATABASE_URL" | sed -E 's/^"(.*)"$/\1/')"
: "${DIRECT_DATABASE_URL:?DIRECT_DATABASE_URL is required}"
target_database="$(printf '%s' "$DIRECT_DATABASE_URL" | sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#')"
target_role="$(printf '%s' "$DIRECT_DATABASE_URL" | sed -E 's#^[^:]+://([^:]+):.*#\1#')"
case "$target_database:$target_role" in *[!a-zA-Z0-9_:]*) printf 'Unsafe target database or role.\n' >&2; exit 1;; esac

set -a
# shellcheck disable=SC1091
. /opt/infrastructure/postgres/.env
set +a
: "${POSTGRES_ADMIN_PASSWORD:?missing shared admin password}"

target_tables="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d "$target_database" -Atc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'")"
test "$target_tables" = "0" || {
  printf 'Target database is not empty (%s public tables); refusing overwrite.\n' "$target_tables" >&2
  exit 1
}

migration_dir="/opt/infrastructure/postgres/migrations/allshops"
mkdir -p "$migration_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$migration_dir/allshops-before-shared-$stamp.dump"
umask 077
printf 'Creating immutable source backup from %s...\n' "$old_container"
docker exec "$old_container" pg_dump -U "$old_user" -d "$old_database" -Fc -Z 9 --no-owner > "$dump.partial"
docker exec -i shared-postgres pg_restore -l < "$dump.partial" >/dev/null
mv "$dump.partial" "$dump"
sha256sum "$dump" > "$dump.sha256"
sha256sum --check "$dump.sha256"

printf 'Restoring into isolated shared database %s...\n' "$target_database"
docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  pg_restore -U infra_admin -d "$target_database" --no-owner --role="$target_role" --exit-on-error < "$dump"

source_tables="$(docker exec "$old_container" psql -U "$old_user" -d "$old_database" -Atc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'")"
target_tables="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d "$target_database" -Atc \
  "SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname='public'")"
test "$source_tables" = "$target_tables" || {
  printf 'Verification failed: source tables=%s target tables=%s\n' "$source_tables" "$target_tables" >&2
  exit 1
}

for table in organizations users sales stock_movements inventory_balances; do
  source_exists="$(docker exec "$old_container" psql -U "$old_user" -d "$old_database" -Atc \
    "SELECT to_regclass('public.$table') IS NOT NULL")"
  if [ "$source_exists" = "t" ]; then
    source_rows="$(docker exec "$old_container" psql -U "$old_user" -d "$old_database" -Atc "SELECT count(*) FROM public.$table")"
    target_rows="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
      psql -U infra_admin -d "$target_database" -Atc "SELECT count(*) FROM public.$table")"
    test "$source_rows" = "$target_rows" || {
      printf 'Verification failed: %s source rows=%s target rows=%s\n' "$table" "$source_rows" "$target_rows" >&2
      exit 1
    }
    printf 'Verified critical table %s: %s rows\n' "$table" "$source_rows"
  fi
done

printf '%s source=%s target=%s backup=%s\n' "$stamp" "$old_container" "$target_database" "$dump" > .shared-migration-verified
chmod 600 .shared-migration-verified
printf 'Migration verified (%s tables). Legacy container and volume were left untouched.\n' "$target_tables"
printf 'Marker created: .shared-migration-verified\n'
