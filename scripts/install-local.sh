#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root."; exit 1; }
command -v apt-get >/dev/null || { echo "Requiere Debian o Ubuntu."; exit 1; }
INSTALL_DIR="${1:-/opt/z-flow}"
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-3001}"
[ ! -e "$INSTALL_DIR" ] || { echo "Ya existe $INSTALL_DIR; elige otra ruta."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl gnupg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker info >/dev/null || { echo "Docker no inicia; habilita nesting=1 y keyctl=1 en el LXC."; exit 1; }

git clone --depth 1 --branch develop https://github.com/ronbercito/z-flow.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
cp .env.example .env
sed -i "s/^WEB_PORT=.*/WEB_PORT=$WEB_PORT/; s/^API_PORT=.*/API_PORT=$API_PORT/; s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 32)/; s/^DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$(openssl rand -hex 32)/" .env
chmod 600 .env

docker compose up -d --build
for _ in $(seq 1 60); do
  api_ok=0; web_ok=0
  curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1 && api_ok=1
  curl -fsS "http://127.0.0.1:$WEB_PORT/health" >/dev/null 2>&1 && web_ok=1
  [ "$api_ok" -eq 1 ] && [ "$web_ok" -eq 1 ] && break
  sleep 2
done
[ "${api_ok:-0}" -eq 1 ] && [ "${web_ok:-0}" -eq 1 ] || { docker compose logs --tail=80; echo "Z-FLOW no quedó saludable."; exit 1; }

bash scripts/install-backup-cron.sh
bash scripts/backup.sh
BACKUP="$(find backups -maxdepth 1 -type f -name 'zflow_*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
bash scripts/test-restore.sh "$BACKUP"

IP="$(hostname -I | awk '{print $1}')"
echo "Z-FLOW listo: http://${IP:-IP_DEL_CONTENEDOR}:$WEB_PORT"
docker compose logs --no-color api | grep -E 'OWNER +usuario:|FILIAL +usuario:' || echo "Claves iniciales: cd $INSTALL_DIR && docker compose logs api"
