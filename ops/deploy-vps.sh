#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-ops/vps-production.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
EDGE_MODE="${EDGE_MODE:-cloudflare-tunnel}"

test -f "$ENV_FILE" || {
  printf 'Missing %s. Copy ops/vps-production.env.example and populate its secrets.\n' "$ENV_FILE" >&2
  exit 1
}

if grep -q 'REPLACE_' "$ENV_FILE"; then
  printf 'Refusing deployment: %s still contains REPLACE_ placeholders.\n' "$ENV_FILE" >&2
  exit 1
fi

for host in allshopspos.com www.allshopspos.com api.allshopspos.com; do
  getent ahosts "$host" >/dev/null 2>&1 || {
    printf 'DNS is not ready for %s. Create its Cloudflare A record before deployment.\n' "$host" >&2
    exit 1
  }
done

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

if [ "$EDGE_MODE" = "caddy" ] && [ -z "${CADDY_CONTAINER:-}" ] && docker inspect rivera-caddy-1 >/dev/null 2>&1; then
  CADDY_CONTAINER=rivera-caddy-1
fi

case "$EDGE_MODE" in
  cloudflare-tunnel)
    grep -Eq '^CLOUDFLARE_TUNNEL_TOKEN=.+$' "$ENV_FILE" || {
      printf 'CLOUDFLARE_TUNNEL_TOKEN is required when EDGE_MODE=cloudflare-tunnel.\n' >&2
      exit 1
    }
    ;;
  caddy) ;;
  *) printf 'Unsupported EDGE_MODE: %s (use cloudflare-tunnel or caddy).\n' "$EDGE_MODE" >&2; exit 2 ;;
esac

for dependency in shared-postgres shared-pgbouncer shared-redis; do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' "$dependency" 2>/dev/null || true)" != "healthy" ]; then
    printf 'Shared dependency %s is not healthy. Install/check /opt/infrastructure/postgres first.\n' "$dependency" >&2
    exit 1
  fi
done
docker network inspect shared_backend >/dev/null 2>&1 || {
  printf 'Missing private shared_backend Docker network.\n' >&2
  exit 1
}

legacy_postgres="$(docker ps -aq \
  --filter label=com.docker.compose.project=allshops-production \
  --filter label=com.docker.compose.service=postgres | head -n 1)"
if [ -n "$legacy_postgres" ] && [ ! -f .shared-migration-verified ]; then
  printf 'Legacy AllShops PostgreSQL was detected. Refusing to switch before a verified migration.\n' >&2
  printf 'Run ./ops/migrate-allshops-to-shared-postgres.sh, review its checks, then redeploy.\n' >&2
  exit 1
fi

printf 'Validating production Compose configuration...\n'
compose config --quiet

printf 'Building immutable production services...\n'
compose build --pull web api worker migrate

if [ "${SKIP_PREDEPLOY_BACKUP:-false}" != "true" ]; then
  printf 'Creating verified pre-deployment PostgreSQL backup...\n'
  SKIP_OFFSITE=true /opt/infrastructure/postgres/bin/backup-databases.sh allshops_db
fi

printf 'Deploying migration, API, worker, web, and edge...\n'
if [ "$EDGE_MODE" = "cloudflare-tunnel" ]; then
  compose --profile cloudflare-tunnel up -d --remove-orphans
elif [ -n "${CADDY_CONTAINER:-}" ]; then
  compose up -d --remove-orphans
  CADDY_CONTAINER="$CADDY_CONTAINER" ./ops/attach-existing-caddy.sh
else
  compose --profile standalone-edge up -d --remove-orphans
fi

printf 'Waiting for public readiness...\n'
expected_git_sha="$(awk -F= '$1 == "GIT_SHA" { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE")"
test -n "$expected_git_sha" || {
  printf 'GIT_SHA is required for immutable public readiness verification.\n' >&2
  exit 1
}
attempt=0
until version_payload="$(curl --fail --silent --show-error https://api.allshopspos.com/api/v1/version 2>/dev/null)" \
  && printf '%s' "$version_payload" | grep -Fq "\"gitSha\":\"$expected_git_sha\"" \
  && curl --fail --silent --show-error https://api.allshopspos.com/api/v1/health/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    compose ps
    if [ "$EDGE_MODE" = "cloudflare-tunnel" ]; then
      compose --profile cloudflare-tunnel logs --tail=100 migrate api cloudflared
    else
      compose logs --tail=100 migrate api caddy
    fi
    exit 1
  fi
  sleep 5
done

curl --fail --silent --show-error https://allshopspos.com/login >/dev/null
curl --fail --silent --show-error https://www.allshopspos.com/login >/dev/null
compose ps
printf 'AllShops production deployment is healthy.\n'
