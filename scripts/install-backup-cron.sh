#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_FILE="/etc/cron.d/zflow-backup"

cat > "$CRON_FILE" <<EOF
# Z-FLOW database backup - every day at 03:00
0 3 * * * root cd $ROOT_DIR && ZFLOW_BACKUP_RETENTION_DAYS=14 ./scripts/backup.sh >> /var/log/zflow-backup.log 2>&1
EOF

chmod 0644 "$CRON_FILE"
chmod +x "$ROOT_DIR/scripts/backup.sh" "$ROOT_DIR/scripts/restore.sh"

echo "[Z-FLOW] Backup automático instalado: diario 03:00, retención 14 días."
echo "[Z-FLOW] Log: /var/log/zflow-backup.log"
