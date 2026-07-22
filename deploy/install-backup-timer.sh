#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/club-pwa}"
SERVICE_FILE="/etc/systemd/system/club-pwa-backup.service"
TIMER_FILE="/etc/systemd/system/club-pwa-backup.timer"
VERIFY_SERVICE_FILE="/etc/systemd/system/club-pwa-backup-verify.service"
VERIFY_TIMER_FILE="/etc/systemd/system/club-pwa-backup-verify.timer"
KUMA_SERVICE_FILE="/etc/systemd/system/club-pwa-kuma-backup.service"
KUMA_TIMER_FILE="/etc/systemd/system/club-pwa-kuma-backup.timer"

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

cat > "$VERIFY_SERVICE_FILE" <<EOF
[Unit]
Description=Verify latest Club PWA database backup restore
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
Environment=DEPLOY_DIR=$DEPLOY_DIR
ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/verify-postgres-backup.sh
EOF

cat > "$VERIFY_TIMER_FILE" <<'EOF'
[Unit]
Description=Weekly Club PWA database restore verification

[Timer]
OnCalendar=Sun *-*-* 04:30:00 Asia/Novosibirsk
RandomizedDelaySec=20m
Persistent=true
Unit=club-pwa-backup-verify.service

[Install]
WantedBy=timers.target
EOF

cat > "$KUMA_SERVICE_FILE" <<EOF
[Unit]
Description=Club PWA Uptime Kuma backup to private S3
After=docker.service club-pwa-uptime-kuma-1.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$DEPLOY_DIR
Environment=DEPLOY_DIR=$DEPLOY_DIR
ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/backup-uptime-kuma-s3.sh
EOF

cat > "$KUMA_TIMER_FILE" <<'EOF'
[Unit]
Description=Nightly Club PWA Uptime Kuma backup

[Timer]
OnCalendar=*-*-* 03:10:00
RandomizedDelaySec=20m
Persistent=true
Unit=club-pwa-kuma-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now club-pwa-backup.timer
systemctl enable --now club-pwa-backup-verify.timer
systemctl enable --now club-pwa-kuma-backup.timer
systemctl --no-pager --full status club-pwa-backup.timer
systemctl --no-pager --full status club-pwa-backup-verify.timer
systemctl --no-pager --full status club-pwa-kuma-backup.timer
