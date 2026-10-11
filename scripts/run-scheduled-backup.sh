#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.scheduled-backup.lock"
flock -n 9 || exit 0
SETTINGS_FILE="$BACKUP_DIR/backup-schedule.env"
BACKUP_TIME="03:00"
RETENTION_DAYS="14"

if [ -f "$SETTINGS_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      BACKUP_TIME) BACKUP_TIME="$value" ;;
      BACKUP_RETENTION_DAYS) RETENTION_DAYS="$value" ;;
    esac
  done < "$SETTINGS_FILE"
fi

if [[ ! "$BACKUP_TIME" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "[Z-FLOW] Hora de backup inválida en $SETTINGS_FILE: $BACKUP_TIME"
  exit 1
fi
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [ "$RETENTION_DAYS" -lt 1 ] || [ "$RETENTION_DAYS" -gt 3650 ]; then
  echo "[Z-FLOW] Retención inválida en $SETTINGS_FILE: $RETENTION_DAYS"
  exit 1
fi

CURRENT_TIME="$(TZ=America/Lima date +%H:%M)"
[[ "$CURRENT_TIME" > "$BACKUP_TIME" || "$CURRENT_TIME" = "$BACKUP_TIME" ]] || exit 0

TODAY="$(TZ=America/Lima date +%F)"
LAST_RUN_FILE="$BACKUP_DIR/.last-scheduled-backup"
if [ -f "$LAST_RUN_FILE" ] && [ "$(cat "$LAST_RUN_FILE")" = "$TODAY" ]; then
  exit 0
fi

cd "$ROOT_DIR"
ZFLOW_BACKUP_RETENTION_DAYS="$RETENTION_DAYS" bash ./scripts/backup.sh
TEMP_LAST_RUN="$LAST_RUN_FILE.$$"
printf '%s\n' "$TODAY" > "$TEMP_LAST_RUN"
mv -f "$TEMP_LAST_RUN" "$LAST_RUN_FILE"
echo "[Z-FLOW] Copia automática completada para $TODAY; horario $BACKUP_TIME, retención $RETENTION_DAYS días."
