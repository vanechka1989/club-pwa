# Automatic database backups

Production creates a PostgreSQL custom-format dump every night and uploads it to the private configured S3 storage under `system/database-backups/`. The upload is verified by reading object metadata before old backups are removed. The default retention period is 30 days, and reserve S3 mirroring is used automatically when configured.

Install or refresh the timer after a successful deployment:

```bash
cd /opt/club-pwa
DEPLOY_DIR=/opt/club-pwa bash deploy/install-backup-timer.sh
```

Check the latest run:

```bash
systemctl status club-pwa-backup.service
journalctl -u club-pwa-backup.service --since yesterday
systemctl list-timers club-pwa-backup.timer
```

Once a week, download the newest object to an isolated PostgreSQL instance and run `pg_restore --list backup.dump` followed by a full restore. Never run a restore drill against the production database.
