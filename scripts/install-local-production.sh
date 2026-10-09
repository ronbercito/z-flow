#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  chmod 600 "$ROOT_DIR/.env"
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker
fi

echo "[1/3] Backup automático"
bash "$ROOT_DIR/scripts/install-backup-cron.sh"

echo "[2/3] Rotación de logs"
cat >/etc/logrotate.d/zflow <<EOF
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

echo "[3/3] Verificación"
cd "$ROOT_DIR"
docker compose up -d
bash "$ROOT_DIR/scripts/diagnose.sh"

echo "Z-FLOW local listo para operación en Proxmox."
