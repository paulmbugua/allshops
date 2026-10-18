#!/usr/bin/env sh
set -eu

# Attach AllShops to an already-running host Caddy instance (for VPS hosts
# serving more than one project). The script is idempotent and keeps a backup
# before changing the host Caddyfile.
CADDY_CONTAINER="${CADDY_CONTAINER:-rivera-caddy-1}"
CADDYFILE="${CADDYFILE:-/opt/apps/rivera/deploy/Caddyfile}"
NETWORK="${NETWORK:-allshops_edge}"
MARKER="# BEGIN ALLSHOPS MANAGED ROUTES"

docker network inspect "$NETWORK" >/dev/null
docker inspect "$CADDY_CONTAINER" >/dev/null
test -f "$CADDYFILE"

docker network connect "$NETWORK" "$CADDY_CONTAINER" 2>/dev/null || true

if ! grep -Fq "$MARKER" "$CADDYFILE"; then
  backup="${CADDYFILE}.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  cp "$CADDYFILE" "$backup"
  cat >> "$CADDYFILE" <<'CADDY'

# BEGIN ALLSHOPS MANAGED ROUTES
allshopspos.com, www.allshopspos.com {
  encode zstd gzip
  @api path /api/*
  handle @api {
    reverse_proxy allshops-api:4000
  }
  handle {
    reverse_proxy allshops-web:3000
  }
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server
  }
}

api.allshopspos.com {
  encode zstd gzip
  reverse_proxy allshops-api:4000
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server
  }
}
# END ALLSHOPS MANAGED ROUTES
CADDY
fi

docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
printf 'AllShops routes attached to %s using %s.\n' "$CADDY_CONTAINER" "$NETWORK"
