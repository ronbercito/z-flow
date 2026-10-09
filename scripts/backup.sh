#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${ZFLOW_BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${ZFLOW_BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/zflow_${STAMP}.sql.gz"
TMP_FILE="$BACKUP_DIR/.zflow_${STAMP}_$$.sql.gz"
SUFFIX=1
while [ -e "$OUT_FILE" ]; do
  OUT_FILE="$BACKUP_DIR/zflow_${STAMP}_${SUFFIX}.sql.gz"
  SUFFIX=$((SUFFIX + 1))
done
trap 'rm -f "$TMP_FILE"' EXIT

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cd "$ROOT_DIR"

echo "[Z-FLOW] Creando backup $OUT_FILE"
docker compose exec -T db sh -c 'mariadb-dump --single-transaction --routines --triggers -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' \
  | gzip -9 > "$TMP_FILE"

test -s "$TMP_FILE"
gzip -t "$TMP_FILE"
mv "$TMP_FILE" "$OUT_FILE"
chmod 600 "$OUT_FILE"

find "$BACKUP_DIR" -type f -name 'zflow_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete

echo "[Z-FLOW] Backup completado: $OUT_FILE"
