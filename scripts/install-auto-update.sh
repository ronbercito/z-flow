#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Ejecuta este instalador como root."; exit 1; }
command -v systemctl >/dev/null 2>&1 || { echo "El actualizador automático requiere systemd."; exit 1; }
mkdir -p "$ROOT_DIR/backups"
chmod 700 "$ROOT_DIR/backups"

cat > /etc/systemd/system/zflow-auto-update.service <<EOF
[Unit]
Description=Comprobación y actualización segura de Z-FLOW
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory="$ROOT_DIR"
ExecStart=/bin/bash "$ROOT_DIR/scripts/auto-update-check.sh"
User=root
EOF

cat > /etc/systemd/system/zflow-auto-update.timer <<'EOF'
[Unit]
Description=Revisa periódicamente versiones de Z-FLOW

[Timer]
OnBootSec=15s
OnUnitActiveSec=5s
AccuracySec=1s
Unit=zflow-auto-update.service

[Install]
WantedBy=timers.target
EOF

chmod 0644 /etc/systemd/system/zflow-auto-update.service /etc/systemd/system/zflow-auto-update.timer
systemctl daemon-reload
systemctl enable --now zflow-auto-update.timer
echo "[Z-FLOW] Actualizador automático instalado; revisará cada 5 o 10 segundos según el panel."
