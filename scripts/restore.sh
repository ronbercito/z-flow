#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 /ruta/al/backup.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "No existe: $BACKUP_FILE"
  exit 1
fi

cd "$ROOT_DIR"

echo "ADVERTENCIA: esto reemplazará los datos actuales de la base Z-FLOW."
read -r -p "Escribe RESTAURAR para continuar: " CONFIRM
if [ "$CONFIRM" != "RESTAURAR" ]; then
  echo "Cancelado."
  exit 1
fi

gunzip -c "$BACKUP_FILE" \
  | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'

echo "[Z-FLOW] Restauración completada."
