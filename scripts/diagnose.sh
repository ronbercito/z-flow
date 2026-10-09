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

echo "=== Z-FLOW diagnóstico local ==="
echo "Fecha: $(date -Is)"
echo
echo "--- Sistema ---"
uname -a
echo
echo "--- Disco ---"
df -h /
echo
echo "--- Configuración sensible ---"
if [ -f .env ]; then
  PERMS="$(stat -c '%a' .env 2>/dev/null || true)"
  echo ".env permisos: ${PERMS:-desconocidos}"
  if grep -Eq 'change_this|zflow_local_change_me|root_local_change_me' .env; then
    echo "ADVERTENCIA: se detectaron contraseñas de ejemplo en .env"
  else
    echo "Contraseñas de ejemplo: no detectadas"
  fi
else
  echo "ADVERTENCIA: no existe .env"
fi
echo
echo "--- Docker Compose ---"
docker compose ps
echo
echo "--- Salud API ---"
if curl -fsS http://127.0.0.1:"${API_PORT:-3001}"/health; then echo; else echo "API NO RESPONDE"; fi
echo
echo "--- Salud Web ---"
if curl -fsSI http://127.0.0.1:"${WEB_PORT:-8080}"/health | head -n 1; then :; else echo "WEB NO RESPONDE"; fi
echo
echo "--- Uso Docker ---"
docker system df || true
echo
echo "--- Último backup ---"
LATEST="$(find "$ROOT_DIR/backups" -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)"
if [ -n "$LATEST" ]; then
  ls -lh "$LATEST"
  gzip -t "$LATEST" && echo "Integridad gzip: OK"
else
  echo "No hay backups zflow_*.sql.gz"
fi
echo
echo "--- Logs recientes API ---"
docker compose logs --tail=30 api
