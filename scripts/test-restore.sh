#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_FILE="${1:-}"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "[Z-FLOW] No se encontró backup para probar."
  exit 1
fi

TEST_DB="zflow_restore_check_$(date +%s)"
TABLES=(branches users operations daily_closures receipts)

cleanup() {
  docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$1\`;"' sh "$TEST_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

db_count() {
  local database="$1"
  local table="$2"
  docker compose exec -T db sh -c 'mariadb -N -uroot -p"$MARIADB_ROOT_PASSWORD" "$1" -e "SELECT COUNT(*) FROM $2;"' sh "$database" "$table" | tr -d '\r'
}

echo "=== Z-FLOW prueba de restauración no destructiva ==="
echo "Backup: $BACKUP_FILE"
echo "Base temporal: $TEST_DB"

echo "[1/5] Validando archivo"
test -s "$BACKUP_FILE"
gzip -t "$BACKUP_FILE"
echo "Integridad gzip: OK"

echo "[2/5] Capturando conteos de producción"
declare -A PROD_COUNTS
for table in "${TABLES[@]}"; do
  PROD_COUNTS["$table"]="$(db_count "${DB_NAME:-zflow}" "$table")"
  echo "  $table=${PROD_COUNTS[$table]}"
done

echo "[3/5] Creando base temporal"
docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "CREATE DATABASE \`$1\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"' sh "$TEST_DB"

echo "[4/5] Restaurando backup en la base temporal"
gunzip -c "$BACKUP_FILE" \
  | docker compose exec -T db sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$1"' sh "$TEST_DB"

echo "[5/5] Comparando producción vs. restauración"
FAILED=0
for table in "${TABLES[@]}"; do
  restored="$(db_count "$TEST_DB" "$table")"
  production="${PROD_COUNTS[$table]}"
  printf "  %-16s producción=%s restaurado=%s" "$table" "$production" "$restored"
  if [ "$production" = "$restored" ]; then
    echo "  OK"
  else
    echo "  ERROR"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "[Z-FLOW] ERROR: la restauración no coincide con los conteos de producción."
  exit 1
fi

echo "[Z-FLOW] Prueba de restauración OK."
echo "[Z-FLOW] La base productiva no fue modificada y la base temporal será eliminada."
