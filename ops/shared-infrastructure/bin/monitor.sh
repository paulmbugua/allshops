#!/usr/bin/env sh
set -eu
ROOT="${INFRA_ROOT:-/opt/infrastructure/postgres}"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

printf '%s\n' '=== containers ==='
docker compose --env-file .env -f compose.yml ps
printf '%s\n' '=== resource snapshot ==='
docker stats --no-stream shared-postgres shared-pgbouncer shared-redis
printf '%s\n' '=== database sizes and connections ==='
docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres psql -U infra_admin -d postgres -c \
  "SELECT d.datname, pg_size_pretty(pg_database_size(d.datname)) AS size, count(a.pid) AS connections FROM pg_database d LEFT JOIN pg_stat_activity a ON a.datname=d.datname WHERE d.datallowconn GROUP BY d.datname ORDER BY pg_database_size(d.datname) DESC;"
printf '%s\n' '=== active queries older than 30 seconds ==='
docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres psql -U infra_admin -d postgres -c \
  "SELECT pid, datname, usename, now()-query_start AS age, wait_event_type, left(query,120) AS query FROM pg_stat_activity WHERE state <> 'idle' AND query_start < now()-interval '30 seconds' ORDER BY query_start;"
printf '%s\n' '=== host disk ==='
df -h "$ROOT"
