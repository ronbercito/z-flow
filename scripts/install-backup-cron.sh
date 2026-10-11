#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_FILE="/etc/cron.d/zflow-backup"

if ! command -v cron >/dev/null 2>&1; then
  apt-get update
  apt-get install -y cron
fi

cat > "$CRON_FILE" <<EOF
# Z-FLOW checks the saved daily schedule every minute; backups run once at the configured Lima time.
CRON_TZ=America/Lima
* * * * * root cd $ROOT_DIR && TZ=America/Lima bash ./scripts/run-scheduled-backup.sh >> /var/log/zflow-backup.log 2>&1
EOF

chmod 0644 "$CRON_FILE"

if command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now cron
else
  service cron start || true
fi

echo "[Z-FLOW] Programador de backups activo (America/Lima). Configuración predeterminada: 03:00, retención 14 días."
echo "[Z-FLOW] Log: /var/log/zflow-backup.log"

