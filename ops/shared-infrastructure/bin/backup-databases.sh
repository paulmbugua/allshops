#!/usr/bin/env sh
set -eu

ROOT="${INFRA_ROOT:-/opt/infrastructure/postgres}"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${POSTGRES_ADMIN_PASSWORD:?missing from .env}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DAY="$(date -u +%u)"
MONTH_DAY="$(date -u +%d)"
ONLY_DATABASE="${1:-}"

if [ -n "$ONLY_DATABASE" ]; then
  DATABASES="$ONLY_DATABASE"
else
  DATABASES="$(docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
    psql -U infra_admin -d postgres -Atc \
    "SELECT datname FROM pg_database WHERE datallowconn AND NOT datistemplate AND datname <> 'postgres' ORDER BY 1")"
fi

retain_count() {
  directory="$1"
  keep="$2"
  find "$directory" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' \
    | sort -rn | awk -v keep="$keep" 'NR > keep {print $2}' \
    | while IFS= read -r old; do rm -f -- "$old" "$old.sha256"; done
}

for database in $DATABASES; do
  case "$database" in *[!a-zA-Z0-9_]*) printf 'Unsafe database name: %s\n' "$database" >&2; exit 1;; esac
  base="$BACKUP_ROOT/$database"
  mkdir -p "$base/daily" "$base/weekly" "$base/monthly"
  target="$base/daily/$database-$STAMP.dump"
  partial="$target.partial"
  umask 077
  printf 'Backing up %s to %s\n' "$database" "$target"
  docker exec -e PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" shared-postgres \
    pg_dump -U infra_admin -d "$database" -Fc -Z 9 --no-owner > "$partial"
  test "$(wc -c < "$partial")" -ge "${MINIMUM_BACKUP_BYTES:-1024}"
  docker exec -i shared-postgres pg_restore -l < "$partial" >/dev/null
  mv "$partial" "$target"
  target_dir="$(dirname "$target")"
  target_name="$(basename "$target")"
  (cd "$target_dir" && sha256sum "$target_name" > "$target_name.sha256")
  (cd "$target_dir" && sha256sum --check "$target_name.sha256" >/dev/null)

  if [ "$DAY" = "7" ]; then cp -p "$target" "$target.sha256" "$base/weekly/"; fi
  if [ "$MONTH_DAY" = "01" ]; then cp -p "$target" "$target.sha256" "$base/monthly/"; fi
  retain_count "$base/daily" 7
  retain_count "$base/weekly" 4
  retain_count "$base/monthly" 3
done

if [ "${SKIP_OFFSITE:-false}" != "true" ]; then
  : "${OFFSITE_REMOTE:?OFFSITE_REMOTE is required for durable backups}"
  command -v rclone >/dev/null 2>&1 || { printf 'rclone is required for offsite backups.\n' >&2; exit 1; }
  rclone sync "$BACKUP_ROOT" "$OFFSITE_REMOTE" --checksum --transfers 2 --checkers 4
fi
printf 'All requested database backups were verified%s.\n' "${OFFSITE_REMOTE:+ and copied offsite}"
