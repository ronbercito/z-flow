#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${ZFLOW_BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${ZFLOW_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
TMP_FILE="$BACKUP_DIR/.zflow_${STAMP}.sql.gz"
OUT_FILE="$BACKUP_DIR/zflow_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
cd "$ROOT_DIR"

echo "[Z-FLOW] Creando backup $OUT_FILE"
docker compose exec -T db sh -c 'mariadb-dump --single-transaction --routines --triggers -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' \
  | gzip -9 > "$TMP_FILE"

test -s "$TMP_FILE"
gzip -t "$TMP_FILE"
mv "$TMP_FILE" "$OUT_FILE"

find "$BACKUP_DIR" -type f -name 'zflow_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[Z-FLOW] Backup completado: $OUT_FILE"
