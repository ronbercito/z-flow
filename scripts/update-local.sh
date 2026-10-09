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

echo "=== Z-FLOW actualización local segura ==="
echo "1) Backup previo"
bash scripts/backup.sh

BEFORE="$(git rev-parse HEAD)"
echo "Versión actual: $BEFORE"

echo "2) Actualizando rama main"
git fetch origin main
if git show-ref --verify --quiet refs/heads/main; then
  git checkout main
else
  git checkout -b main --track origin/main
fi
git pull --ff-only origin main

echo "Retirando credenciales antiguas de Factiliza"
unset FACTILIZA_API_TOKEN FACTILIZA_API_BASE_URL FACTILIZA_BOLETA_SERIES FACTILIZA_RUS_ACTIVITY_CONFIRMED
if [ -f .env ]; then
  sed -i -E '/^[[:space:]]*(export[[:space:]]+)?FACTILIZA_[A-Z0-9_]+[[:space:]]*=/d' .env
fi

echo "3) Construyendo contenedores"
docker compose build

echo "4) Aplicando actualización"
docker compose up -d

echo "5) Esperando servicios"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:"${API_PORT:-3001}"/health >/dev/null 2>&1; then
    echo "API saludable."
    docker compose ps
    echo "Actualización completada: $(git rev-parse HEAD)"
    exit 0
  fi
  sleep 2
done

echo "ERROR: la API no quedó saludable después de actualizar."
echo "Commit anterior: $BEFORE"
echo "No se hace rollback automático de base de datos."
echo "Revisa: docker compose logs --tail=150 api"
exit 1
