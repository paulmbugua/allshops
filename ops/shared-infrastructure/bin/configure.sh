#!/usr/bin/env sh
set -eu

ROOT="${INFRA_ROOT:-/opt/infrastructure/postgres}"
mkdir -p "$ROOT/secrets"
cd "$ROOT"

if [ ! -f .env ]; then
  umask 077
  postgres_password="$(openssl rand -hex 32)"
  redis_password="$(openssl rand -hex 32)"
  {
    printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$postgres_password"
    printf 'REDIS_PASSWORD=%s\n' "$redis_password"
    printf 'BACKUP_ROOT=/opt/infrastructure/postgres/backups\n'
    printf 'OFFSITE_REMOTE=\n'
  } > .env
  printf 'Generated %s/.env. Store a protected copy before continuing.\n' "$ROOT"
fi

chmod 600 .env
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_ADMIN_PASSWORD:?missing from .env}"
: "${REDIS_PASSWORD:?missing from .env}"
mkdir -p "${BACKUP_ROOT:-$ROOT/backups}"

umask 077
if [ ! -f secrets/pgbouncer-users.txt ]; then
  printf '"infra_admin" "%s"\n' "$POSTGRES_ADMIN_PASSWORD" > secrets/pgbouncer-users.txt
fi
chmod 600 secrets/pgbouncer-users.txt

docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --build
attempt=0
until docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  pg_isready -U infra_admin -d postgres >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 30 || { printf 'PostgreSQL did not become ready.\n' >&2; exit 1; }
  sleep 2
done
docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
  psql -v ON_ERROR_STOP=1 -U infra_admin -d postgres -c \
  'REVOKE CONNECT ON DATABASE postgres FROM PUBLIC; GRANT CONNECT ON DATABASE postgres TO infra_admin;' >/dev/null
docker compose --env-file .env -f compose.yml ps
