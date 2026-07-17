#!/usr/bin/env bash
set -euo pipefail

container="pi-memory-postgres"
backup_dir="${BACKUP_DIR:-/var/backups/pi-memory-postgres}"
retention_days="${RETENTION_DAYS:-7}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="${backup_dir}/.pi_memory-${stamp}.dump.tmp"
final="${backup_dir}/pi_memory-${stamp}.dump"

install -d -m 0700 "$backup_dir"
trap 'rm -f "$tmp"' EXIT

docker exec "$container" pg_dump --username postgres --dbname pi_memory --format=custom > "$tmp"
docker run --rm -i \
  pgvector/pgvector:0.8.5-pg17-bookworm@sha256:555f6d1b6373d0f50ab7eb83062f0a7214ca17b9e5885fb60aaceeb082d58cb5 \
  pg_restore --list < "$tmp" >/dev/null
chmod 0600 "$tmp"
mv "$tmp" "$final"
find "$backup_dir" -type f -name 'pi_memory-*.dump' -mtime "+${retention_days}" -delete
trap - EXIT
printf '%s\n' "$final"
