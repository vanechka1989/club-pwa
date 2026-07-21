#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
SERVICE_FILE="/etc/systemd/system/club-pwa-backup.service"
TIMER_FILE="/etc/systemd/system/club-pwa-backup.timer"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Club PWA PostgreSQL backup to private S3
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
Environment=DEPLOY_DIR=$DEPLOY_DIR
ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/backup-postgres-s3.sh
EOF

cat > "$TIMER_FILE" <<'EOF'
[Unit]
Description=Nightly Club PWA PostgreSQL backup

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=20m
Persistent=true
Unit=club-pwa-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now club-pwa-backup.timer
systemctl start club-pwa-backup.service
systemctl --no-pager --full status club-pwa-backup.service
