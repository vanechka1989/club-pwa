#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"

install -d -m 0755 /var/lib/club-pwa-maintenance

cat > /etc/systemd/system/club-pwa-storage-maintenance.service <<EOF
[Unit]
Description=Bounded Club PWA host storage maintenance
After=docker.service
Requires=docker.service
OnFailure=club-pwa-operational-alert@%n.service

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
Environment=DEPLOY_DIR=$DEPLOY_DIR
ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/maintain-host-storage.sh
TimeoutStartSec=30min
EOF

cat > /etc/systemd/system/club-pwa-storage-maintenance.timer <<'EOF'
[Unit]
Description=Run Club PWA storage maintenance daily

[Timer]
OnCalendar=*-*-* 04:20:00
RandomizedDelaySec=10min
Persistent=true
Unit=club-pwa-storage-maintenance.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now club-pwa-storage-maintenance.timer
systemctl --no-pager --full status club-pwa-storage-maintenance.timer
