#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-ops/vps-production.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

test -f "$ENV_FILE" || {
  printf 'Missing %s. Copy ops/vps-production.env.example and populate its secrets.\n' "$ENV_FILE" >&2
  exit 1
}

if grep -q 'REPLACE_' "$ENV_FILE"; then
  printf 'Refusing deployment: %s still contains REPLACE_ placeholders.\n' "$ENV_FILE" >&2
  exit 1
fi

for host in allshops.ekazi.co.ke api.ekazi.co.ke; do
  getent ahosts "$host" >/dev/null 2>&1 || {
    printf 'DNS is not ready for %s. Create its Cloudflare A record before deployment.\n' "$host" >&2
    exit 1
  }
done

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

printf 'Validating production Compose configuration...\n'
compose config --quiet

printf 'Building immutable production services...\n'
compose build --pull web api worker migrate

printf 'Starting private data services...\n'
compose up -d postgres redis

if [ "${SKIP_PREDEPLOY_BACKUP:-false}" != "true" ]; then
  printf 'Creating verified pre-deployment PostgreSQL backup...\n'
  compose --profile operations run --rm backup
fi

printf 'Deploying migration, API, worker, web, and HTTPS edge...\n'
compose up -d --remove-orphans

printf 'Waiting for public readiness...\n'
attempt=0
until curl --fail --silent --show-error https://api.ekazi.co.ke/api/v1/health/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    compose ps
    compose logs --tail=100 migrate api caddy
    exit 1
  fi
  sleep 5
done

curl --fail --silent --show-error https://allshops.ekazi.co.ke/login >/dev/null
compose ps
printf 'AllShops production deployment is healthy.\n'
