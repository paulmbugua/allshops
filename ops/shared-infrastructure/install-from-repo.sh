#!/usr/bin/env sh
set -eu

SOURCE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET="${INFRA_ROOT:-/opt/infrastructure/postgres}"
if [ ! -d "$TARGET" ]; then
  mkdir -p "$TARGET"
fi

# Preserve server-generated secrets and data. Only versioned templates/scripts/config are updated.
mkdir -p "$TARGET/bin" "$TARGET/config" "$TARGET/pgbouncer" "$TARGET/secrets"
cp "$SOURCE/compose.yml" "$TARGET/compose.yml"
cp "$SOURCE/config/postgresql.conf" "$SOURCE/config/pgbouncer.ini" "$TARGET/config/"
cp "$SOURCE/pgbouncer/Dockerfile" "$TARGET/pgbouncer/Dockerfile"
cp "$SOURCE/pgbouncer/entrypoint.sh" "$TARGET/pgbouncer/entrypoint.sh"
cp "$SOURCE/bin/"*.sh "$TARGET/bin/"
chmod 750 "$TARGET/bin/"*.sh
printf 'Installed shared infrastructure files in %s without replacing .env or secrets.\n' "$TARGET"
printf 'Next: cd %s && ./bin/configure.sh\n' "$TARGET"
