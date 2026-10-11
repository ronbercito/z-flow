#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"
exec >> "$BACKUP_DIR/auto-update.log" 2>&1
exec 9>"$BACKUP_DIR/.auto-update.lock"
flock -n 9 || exit 0

SETTINGS_FILE="$BACKUP_DIR/update-settings.env"
STATUS_FILE="$BACKUP_DIR/update-status.json"
LAST_CHECK_FILE="$BACKUP_DIR/.auto-update-last-check"
FORCE_FILE="$BACKUP_DIR/.auto-update-force"
FAILED_VERSION_FILE="$BACKUP_DIR/.auto-update-failed-version"
ENABLED=1
INTERVAL_SECONDS=10
if [ -f "$SETTINGS_FILE" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      AUTO_UPDATE_ENABLED) ENABLED="$value" ;;
      AUTO_UPDATE_INTERVAL_SECONDS) INTERVAL_SECONDS="$value" ;;
    esac
  done < "$SETTINGS_FILE"
fi

CURRENT_VERSION="$(tr -d '\r\n' < "$ROOT_DIR/VERSION" 2>/dev/null || echo 1.0)"
[[ "$CURRENT_VERSION" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]] || CURRENT_VERSION="1.0"
NOW="$(date +%s)"
FORCED=0
if [ -f "$FORCE_FILE" ]; then
  rm -f "$FORCE_FILE"
  FORCED=1
fi
if [ "$ENABLED" != "1" ]; then
  printf '{"state":"disabled","currentVersion":"%s","latestVersion":"%s","lastChecked":"%s","message":"Actualización automática desactivada desde el panel."}\n' \
    "$CURRENT_VERSION" "$CURRENT_VERSION" "$(date -Is)" > "$STATUS_FILE.tmp"
  mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
  exit 0
fi
if [[ ! "$INTERVAL_SECONDS" =~ ^(5|10)$ ]]; then
  INTERVAL_SECONDS=10
fi
if [ "$FORCED" -ne 1 ] && [ -f "$LAST_CHECK_FILE" ]; then
  LAST_CHECK="$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo 0)"
  if [[ "$LAST_CHECK" =~ ^[0-9]+$ ]] && (( NOW - LAST_CHECK < INTERVAL_SECONDS )); then
    exit 0
  fi
fi
printf '%s\n' "$NOW" > "$LAST_CHECK_FILE"

write_status() {
  local state="$1" latest="$2" message="$3"
  printf '{"state":"%s","currentVersion":"%s","latestVersion":"%s","lastChecked":"%s","message":"%s"}\n' \
    "$state" "$CURRENT_VERSION" "$latest" "$(date -Is)" "$message" > "$STATUS_FILE.tmp"
  mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
}

cd "$ROOT_DIR"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  write_status "local_changes" "$CURRENT_VERSION" "Hay cambios locales; se pausó la actualización para protegerlos."
  echo "[Z-FLOW] Actualización pausada: hay cambios locales rastreados."
  exit 0
fi

echo "[Z-FLOW] Comprobando versión publicada a las $(date -Is)"
if ! git fetch --quiet origin main; then
  write_status "check_failed" "$CURRENT_VERSION" "No se pudo consultar GitHub. Se volverá a intentar."
  echo "[Z-FLOW] Falló git fetch origin main."
  exit 0
fi
LATEST_VERSION="$(git show origin/main:VERSION 2>/dev/null | tr -d '\r\n' || true)"
if [[ ! "$LATEST_VERSION" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  write_status "check_failed" "$CURRENT_VERSION" "La versión publicada no es válida."
  echo "[Z-FLOW] VERSION remoto inválido o inexistente."
  exit 0
fi
if [ "$LATEST_VERSION" = "$CURRENT_VERSION" ] || [ "$(printf '%s\n' "$CURRENT_VERSION" "$LATEST_VERSION" | sort -V | tail -n1)" != "$LATEST_VERSION" ]; then
  write_status "up_to_date" "$LATEST_VERSION" "Z-FLOW está actualizado."
  exit 0
fi

if [ -f "$FAILED_VERSION_FILE" ] && [ "$(cat "$FAILED_VERSION_FILE")" = "$LATEST_VERSION" ]; then
  write_status "failed" "$LATEST_VERSION" "La actualización falló y se restauró la versión anterior. Revisa el registro."
  exit 0
fi

write_status "updating" "$LATEST_VERSION" "Se detectó una nueva versión. Se creó el backup previo y comenzó la instalación."
echo "[Z-FLOW] Nueva versión $LATEST_VERSION; actual instalado $CURRENT_VERSION."
if ZFLOW_AUTO_UPDATE=1 bash "$ROOT_DIR/scripts/update-local.sh"; then
  CURRENT_VERSION="$(tr -d '\r\n' < "$ROOT_DIR/VERSION")"
  rm -f "$FAILED_VERSION_FILE"
  write_status "updated" "$LATEST_VERSION" "Actualización aplicada; backup previo conservado."
  echo "[Z-FLOW] Actualización completada. Versión $CURRENT_VERSION."
else
  printf '%s\n' "$LATEST_VERSION" > "$FAILED_VERSION_FILE"
  write_status "failed" "$LATEST_VERSION" "La actualización falló. Se intentó restaurar código y base de datos; revisa el registro."
  echo "[Z-FLOW] Falló la actualización a $LATEST_VERSION; revisa el registro completo."
fi
