#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

fail() {
  echo "[ERROR] $1"
  exit 1
}

echo "=== Z-FLOW validación final local ==="
echo "Fecha: $(date -Is)"

echo "[1/7] Permisos de configuración"
[ -f .env ] || fail "No existe .env"
PERMS="$(stat -c '%a' .env 2>/dev/null || true)"
[ "$PERMS" = "600" ] || fail ".env debe tener permisos 600; actual: ${PERMS:-desconocido}"
echo "  .env: OK"

echo "[2/7] Docker y servicios"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet docker || fail "Docker no está activo"
  systemctl is-enabled --quiet docker || fail "Docker no está habilitado al arranque"
fi
docker compose up -d >/dev/null

for service in db api web; do
  id="$(docker compose ps -q "$service")"
  [ -n "$id" ] || fail "No existe el contenedor de $service"
  restart_policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$id")"
  [ "$restart_policy" = "unless-stopped" ] || fail "$service no usa restart: unless-stopped"
done
echo "  Docker/reinicio automático: OK"

echo "[3/7] Salud de servicios"
for i in $(seq 1 30); do
  api_ok=0
  web_ok=0
  curl -fsS "http://127.0.0.1:${API_PORT:-3001}/health" >/dev/null 2>&1 && api_ok=1
  curl -fsS "http://127.0.0.1:${WEB_PORT:-8080}/health" >/dev/null 2>&1 && web_ok=1
  if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
    break
  fi
  sleep 2
done
[ "${api_ok:-0}" -eq 1 ] || fail "API no saludable"
[ "${web_ok:-0}" -eq 1 ] || fail "Web no saludable"
echo "  API/Web: OK"

echo "[4/7] Backup nuevo"
bash scripts/backup.sh
LATEST="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
[ -n "$LATEST" ] || fail "No se creó backup"
gzip -t "$LATEST"
echo "  $LATEST: OK"

echo "[5/7] Restauración no destructiva"
bash scripts/test-restore.sh "$LATEST"

echo "[6/7] Backup automático"
[ -f /etc/cron.d/zflow-backup ] || fail "No está instalado /etc/cron.d/zflow-backup"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet cron || fail "cron no está activo"
  systemctl is-enabled --quiet cron || fail "cron no está habilitado al arranque"
fi
grep -q "scripts/backup.sh" /etc/cron.d/zflow-backup || fail "Cron de backup inválido"
echo "  Cron diario: OK"

echo "[7/7] Estado final"
docker compose ps

echo
echo "============================================"
echo " Z-FLOW LOCAL: VALIDACIÓN COMPLETA OK"
echo " Backup verificado y restaurable."
echo " Servicios preparados para reinicio del LXC."
echo "============================================"
