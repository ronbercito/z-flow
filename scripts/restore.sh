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

gzip -t "$BACKUP_FILE" || { echo "La copia está dañada o no es un archivo gzip válido."; exit 1; }

cd "$ROOT_DIR"

echo "ADVERTENCIA: esto reemplazará los datos actuales de la base Z-FLOW."
read -r -p "Escribe RESTAURAR para continuar: " CONFIRM
if [ "$CONFIRM" != "RESTAURAR" ]; then
  echo "Cancelado."
  exit 1
fi

echo "[Z-FLOW] Creando una copia de seguridad antes de restaurar..."
bash "$ROOT_DIR/scripts/backup.sh"
SAFETY_COPY="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' \
  | sort -nr | head -n1 | cut -d' ' -f2-)"
[ -n "$SAFETY_COPY" ] || { echo "No se encontró la copia de seguridad previa."; exit 1; }

if gunzip -c "$BACKUP_FILE" \
  | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'; then
  echo "[Z-FLOW] Restauración completada. Copia previa conservada en: $SAFETY_COPY"
else
  echo "[Z-FLOW] Falló la importación; recuperando la copia previa $SAFETY_COPY..."
  if gunzip -c "$SAFETY_COPY" \
    | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"'; then
    echo "[Z-FLOW] Se recuperó el estado anterior. Revisa el archivo de restauración."
  else
    echo "[Z-FLOW] No se pudo recuperar automáticamente. Conserva esta copia: $SAFETY_COPY"
  fi
  exit 1
fi
