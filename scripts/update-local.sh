#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"
mkdir -p "$ROOT_DIR/backups"
if [ "${ZFLOW_AUTO_UPDATE:-0}" != "1" ]; then
  exec > >(tee -a "$ROOT_DIR/backups/auto-update.log") 2>&1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "=== Z-FLOW actualización segura ==="
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: hay cambios locales rastreados; se cancela para no sobrescribirlos."
  exit 1
fi

BEFORE="$(git rev-parse HEAD)"
PREVIOUS_VERSION="$(tr -d '\r\n' < VERSION 2>/dev/null || echo 1.0)"
echo "Versión actual: $PREVIOUS_VERSION ($BEFORE)"

echo "1) Creando copia previa de la base de datos"
BACKUP_OUTPUT="$(bash scripts/backup.sh)"
printf '%s\n' "$BACKUP_OUTPUT"
BACKUP_FILE="$(printf '%s\n' "$BACKUP_OUTPUT" | sed -n 's/^\[Z-FLOW\] Backup completado: //p' | tail -n1)"
if [ -z "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
  echo "ERROR: no se pudo identificar la copia previa; no se aplicará la actualización."
  exit 1
fi
echo "Copia de seguridad previa: $BACKUP_FILE"

run_update() {
  echo "2) Descargando versión publicada"
  git fetch origin main || return $?
  if git show-ref --verify --quiet refs/heads/main; then
    git checkout main || return $?
  else
    git checkout -b main --track origin/main || return $?
  fi
  git pull --ff-only origin main || return $?

  echo "3) Sincronizando tareas del servidor"
  bash scripts/install-backup-cron.sh || return $?
  bash scripts/install-auto-update.sh || return $?

  echo "Retirando credenciales antiguas de Factiliza"
  unset FACTILIZA_API_TOKEN FACTILIZA_API_BASE_URL FACTILIZA_BOLETA_SERIES FACTILIZA_RUS_ACTIVITY_CONFIRMED
  if [ -f .env ]; then
    sed -i -E '/^[[:space:]]*(export[[:space:]]+)?FACTILIZA_[A-Z0-9_]+[[:space:]]*=/d' .env || return $?
    if ! grep -qE '^[[:space:]]*(export[[:space:]]+)?ZFLOW_CREDENTIAL_KEY=[^[:space:]]+' .env; then
      sed -i -E '/^[[:space:]]*(export[[:space:]]+)?ZFLOW_CREDENTIAL_KEY=/d' .env || return $?
      echo "ZFLOW_CREDENTIAL_KEY=$(openssl rand -hex 32)" >> .env || return $?
      chmod 600 .env || return $?
    fi
  fi
  set -a
  # shellcheck disable=SC1091
  source .env || return $?
  set +a

  export APP_VERSION="$(tr -d '\r\n' < VERSION)"
  echo "4) Construyendo versión $APP_VERSION"
  docker compose build || return $?
  echo "5) Iniciando la actualización"
  docker compose up -d || return $?

  echo "6) Verificando API y panel"
  for _ in $(seq 1 60); do
    api_ok=0
    web_ok=0
    curl -fsS "http://127.0.0.1:${API_PORT:-3001}/health" >/dev/null 2>&1 && api_ok=1
    curl -fsS "http://127.0.0.1:${WEB_PORT:-80}/health" >/dev/null 2>&1 && web_ok=1
    if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
      docker compose ps
      echo "Actualización saludable: versión $APP_VERSION ($(git rev-parse HEAD))"
      return 0
    fi
    sleep 2
  done
  echo "ERROR: API o panel no quedó saludable después de actualizar."
  docker compose logs --tail=150 api web
  return 1
}

if run_update; then
  exit 0
else
  UPDATE_RESULT=$?
fi
echo "ERROR: falló la instalación de la versión nueva. Se restaurará el código y la base de datos anteriores."
echo "Motivo inicial y salida completa en el registro del actualizador."

rollback() {
  cd "$ROOT_DIR" || return 1
  echo "=== Iniciando recuperación de $PREVIOUS_VERSION ==="
  git reset --hard "$BEFORE" || return $?
  export APP_VERSION="$(tr -d '\r\n' < VERSION)"
  docker compose build || return $?
  docker compose stop api web || true
  docker compose up -d db || return $?
  gunzip -c "$BACKUP_FILE" | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"' || return $?
  docker compose up -d api web || return $?
  for _ in $(seq 1 60); do
    api_ok=0
    web_ok=0
    curl -fsS "http://127.0.0.1:${API_PORT:-3001}/health" >/dev/null 2>&1 && api_ok=1
    curl -fsS "http://127.0.0.1:${WEB_PORT:-80}/health" >/dev/null 2>&1 && web_ok=1
    if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
      docker compose ps
      echo "Recuperación completada: código y base de datos en $PREVIOUS_VERSION."
      return 0
    fi
    sleep 2
  done
  echo "ERROR: el rollback no recuperó la salud de API y panel."
  docker compose logs --tail=150 api web db
  return 1
}

if rollback; then
  echo "Actualización cancelada de forma segura; se conserva la copia previa $BACKUP_FILE."
  exit "$UPDATE_RESULT"
else
  echo "ERROR CRÍTICO: no se completó la recuperación. Conserva el backup $BACKUP_FILE y consulta este log."
  exit 2
fi
