#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_FILE="${1:-}"
cd "$ROOT_DIR"

if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "No se encontró backup para probar."
  exit 1
fi

TEST_DB="zflow_restore_check_$(date +%s)"
echo "[Z-FLOW] Probando restauración sin tocar la base productiva."
echo "Backup: $BACKUP_FILE"
echo "Base temporal: $TEST_DB"

gzip -t "$BACKUP_FILE"

docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "CREATE DATABASE `'"$TEST_DB"'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"'

cleanup() {
  docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS `'"$TEST_DB"'`;"' >/dev/null 2>&1 || true
}
trap cleanup EXIT

gunzip -c "$BACKUP_FILE"   | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "'"$TEST_DB"'"'

docker compose exec -T db sh -c 'mariadb -N -uroot -p"$MARIADB_ROOT_PASSWORD" "'"$TEST_DB"'" -e "SELECT CONCAT("branches=",COUNT(*)) FROM branches; SELECT CONCAT("users=",COUNT(*)) FROM users; SELECT CONCAT("operations=",COUNT(*)) FROM operations;"'

echo "[Z-FLOW] Prueba de restauración OK. La base temporal será eliminada."
