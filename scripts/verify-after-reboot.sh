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

echo "=== Z-FLOW verificación después de reinicio ==="
echo "Fecha: $(date -Is)"
echo "Uptime del LXC:"
uptime -p || true

echo "[1/5] Docker"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet docker || fail "Docker no arrancó automáticamente"
  systemctl is-enabled --quiet docker || fail "Docker no está habilitado"
fi
echo "  Docker: OK"

echo "[2/5] Esperando contenedores"
for i in $(seq 1 45); do
  db_id="$(docker compose ps -q db 2>/dev/null || true)"
  api_id="$(docker compose ps -q api 2>/dev/null || true)"
  web_id="$(docker compose ps -q web 2>/dev/null || true)"
  if [ -n "$db_id" ] && [ -n "$api_id" ] && [ -n "$web_id" ]; then
    break
  fi
  sleep 2
done
[ -n "${db_id:-}" ] && [ -n "${api_id:-}" ] && [ -n "${web_id:-}" ] || fail "No arrancaron todos los contenedores"

for service in db api web; do
  id="$(docker compose ps -q "$service")"
  running="$(docker inspect -f '{{.State.Running}}' "$id")"
  [ "$running" = "true" ] || fail "$service no está ejecutándose"
done
echo "  Contenedores: OK"

echo "[3/5] Salud de API y Web"
for i in $(seq 1 45); do
  api_ok=0
  web_ok=0
  curl -fsS "http://127.0.0.1:${API_PORT:-3001}/health" >/dev/null 2>&1 && api_ok=1
  curl -fsS "http://127.0.0.1:${WEB_PORT:-8080}/health" >/dev/null 2>&1 && web_ok=1
  if [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ]; then
    break
  fi
  sleep 2
done
[ "${api_ok:-0}" -eq 1 ] || fail "API no saludable después del reinicio"
[ "${web_ok:-0}" -eq 1 ] || fail "Web no saludable después del reinicio"
echo "  API/Web: OK"

echo "[4/5] Reinicio automático"
for service in db api web; do
  id="$(docker compose ps -q "$service")"
  policy="$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$id")"
  [ "$policy" = "unless-stopped" ] || fail "$service no tiene restart: unless-stopped"
done
echo "  Políticas de reinicio: OK"

echo "[5/5] Backup automático"
[ -f /etc/cron.d/zflow-backup ] || fail "No existe el cron de backup"
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet cron || fail "cron no arrancó automáticamente"
fi
echo "  Cron: OK"

echo
docker compose ps
echo
echo "============================================"
echo " REINICIO DEL LXC: PRUEBA APROBADA"
echo " Z-FLOW arrancó automáticamente y está sano."
echo "============================================"
