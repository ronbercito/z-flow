#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta este instalador como root."; exit 1; }
command -v apt-get >/dev/null || { echo "Requiere Debian o Ubuntu."; exit 1; }

INSTALL_DIR="${1:-/opt/z-flow}"
WEB_PORT="${WEB_PORT:-8080}"
[ ! -e "$INSTALL_DIR" ] || { echo "Ya existe $INSTALL_DIR; elige otra ruta."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
git clone --depth 1 --branch develop https://github.com/ronbercito/z-flow.git "$INSTALL_DIR"
cd "$INSTALL_DIR"

cp .env.example .env
sed -i "s/^WEB_PORT=.*/WEB_PORT=$WEB_PORT/; s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 32)/; s/^DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$(openssl rand -hex 32)/" .env
chmod 600 .env
docker compose up -d --build

for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:$WEB_PORT/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$WEB_PORT/health" >/dev/null || { docker compose logs --tail=80; echo "Z-FLOW no quedó saludable."; exit 1; }

IP="$(hostname -I | awk '{print $1}')"
echo "Z-FLOW instalado: http://${IP:-IP_DEL_CONTENEDOR}:$WEB_PORT"
docker compose logs --no-color api | grep -E 'OWNER +usuario:|FILIAL +usuario:' || echo "Consulta las claves iniciales con: cd $INSTALL_DIR && docker compose logs api"
