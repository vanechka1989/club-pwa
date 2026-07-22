#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"

cat > /etc/systemd/system/club-pwa-host-monitor.service <<EOF
[Unit]
Description=Club PWA host capacity and container health probe
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
Environment=DEPLOY_DIR=$DEPLOY_DIR
ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/check-host-capacity.sh
EOF

cat > /etc/systemd/system/club-pwa-host-monitor.timer <<'EOF'
[Unit]
Description=Run Club PWA host monitor every two minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
Persistent=true
Unit=club-pwa-host-monitor.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now club-pwa-host-monitor.timer
systemctl --no-pager --full status club-pwa-host-monitor.timer
