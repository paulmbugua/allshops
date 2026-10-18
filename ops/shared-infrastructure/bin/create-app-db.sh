#!/usr/bin/env sh
set -eu

APP="${1:-}"
case "$APP" in
  ""|*[!a-z0-9_]*) printf 'Usage: %s lowercase_app_name\n' "$0" >&2; exit 2 ;;
esac
APP_ROLE="${APP}_user"
APP_DATABASE="${APP}_db"

ROOT="${INFRA_ROOT:-/opt/infrastructure/postgres}"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_ADMIN_PASSWORD:?missing from .env}"
: "${REDIS_PASSWORD:?missing from .env}"

if docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = '$APP_ROLE'" | grep -qx 1; then
  printf 'Role %s already exists; refusing to rotate its password implicitly.\n' "$APP_ROLE" >&2
  exit 1
fi
if docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -U infra_admin -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$APP_DATABASE'" | grep -qx 1; then
  printf 'Database %s already exists; refusing to overwrite it.\n' "$APP_DATABASE" >&2
  exit 1
fi

APP_PASSWORD="$(openssl rand -hex 32)"
docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -v ON_ERROR_STOP=1 -U infra_admin -d postgres \
  -v app_role="$APP_ROLE" -v app_password="$APP_PASSWORD" <<'SQL'
CREATE ROLE :"app_role" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :'app_password';
SQL

docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  createdb -U infra_admin -O "$APP_ROLE" "$APP_DATABASE"
docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -v ON_ERROR_STOP=1 -U infra_admin -d postgres \
  -v app_database="$APP_DATABASE" -v app_role="$APP_ROLE" <<'SQL'
REVOKE CONNECT ON DATABASE :"app_database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"app_database" TO :"app_role";
SQL
docker exec -i -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -v ON_ERROR_STOP=1 -U infra_admin -d "$APP_DATABASE" -v app_role="$APP_ROLE" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"app_role";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL

umask 077
printf '"%s" "%s"\n' "$APP_ROLE" "$APP_PASSWORD" >> secrets/pgbouncer-users.txt
docker compose --env-file .env -f compose.yml restart pgbouncer >/dev/null

printf 'Created database %s and least-privilege role %s.\n' "$APP_DATABASE" "$APP_ROLE"
printf 'Copy these values now into the application private environment; they are not logged to a file:\n'
printf 'DATABASE_URL=postgresql://%s:%s@shared-pgbouncer:6432/%s?schema=public&pgbouncer=true&connection_limit=4\n' "$APP_ROLE" "$APP_PASSWORD" "$APP_DATABASE"
printf 'DIRECT_DATABASE_URL=postgresql://%s:%s@shared-postgres:5432/%s?schema=public&connection_limit=2\n' "$APP_ROLE" "$APP_PASSWORD" "$APP_DATABASE"
printf 'REDIS_URL=redis://:%s@shared-redis:6379/0\n' "$REDIS_PASSWORD"
printf 'REDIS_KEY_PREFIX=%s:\n' "$APP"
unset APP_PASSWORD
