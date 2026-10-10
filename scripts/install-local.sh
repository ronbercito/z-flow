#!/usr/bin/env bash
set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root."; exit 1; }
command -v apt-get >/dev/null || { echo "Requiere Debian o Ubuntu."; exit 1; }
INSTALL_DIR="${1:-/opt/z-flow}"
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-3001}"
[ ! -e "$INSTALL_DIR" ] || { echo "Ya existe $INSTALL_DIR; elige otra ruta."; exit 1; }

valid_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
valid_port "$WEB_PORT" || { echo "WEB_PORT debe ser un puerto entre 1 y 65535."; exit 1; }
valid_port "$API_PORT" || { echo "API_PORT debe ser un puerto entre 1 y 65535."; exit 1; }
[ "$WEB_PORT" != "$API_PORT" ] || { echo "WEB_PORT y API_PORT deben ser distintos."; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl gnupg logrotate
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker
docker info >/dev/null || {
  echo "Docker no inicia. En Proxmox habilita nesting=1 y keyctl=1 para este LXC, y vuelve a ejecutar el instalador."
  exit 1
}

git clone --depth 1 --branch main https://github.com/ronbercito/z-flow.git "$INSTALL_DIR"
cd "$INSTALL_DIR"
cp .env.example .env
sed -i "s/^WEB_PORT=.*/WEB_PORT=$WEB_PORT/; s/^API_PORT=.*/API_PORT=$API_PORT/; s/^DB_PASSWORD=.*/DB_PASSWORD=$(openssl rand -hex 32)/; s/^DB_ROOT_PASSWORD=.*/DB_ROOT_PASSWORD=$(openssl rand -hex 32)/" .env
chmod 600 .env
mkdir -p backups
chmod 700 backups

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
cat >/etc/logrotate.d/zflow <<'EOF'
/var/log/zflow-backup.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
EOF
chmod 0644 /etc/logrotate.d/zflow
bash scripts/backup.sh

IP="$(hostname -I | awk '{print $1}')"
echo "Z-FLOW listo: http://${IP:-IP_DEL_CONTENEDOR}:$WEB_PORT"
echo "Directorio: $INSTALL_DIR"
echo "Para actualizar después: cd $INSTALL_DIR && bash scripts/update-local.sh"
docker compose logs --no-color api | grep -E 'OWNER +usuario:|FILIAL +usuario:' || echo "Claves iniciales: cd $INSTALL_DIR && docker compose logs api"
