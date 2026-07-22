import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => {
  const absolute = resolve(__dirname, `../../../../${path}`);
  return existsSync(absolute) ? readFileSync(absolute, "utf-8") : "";
};

const backupScript = repoFile("scripts/backup-postgres-s3.sh");
const installer = repoFile("deploy/install-backup-timer.sh");
const updateWorker = repoFile("deploy/update-worker.sh");
const verifyScript = repoFile("scripts/verify-postgres-backup.sh");
const kumaBackupScript = repoFile("scripts/backup-uptime-kuma-s3.sh");
const operationalUploader = repoFile("apps/api/src/storage/uploadOperationalBackup.ts");

describe("backup infrastructure", () => {
  it("writes an atomic secret-safe status for every database backup run", () => {
    expect(backupScript).toContain('STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/club-pwa-backup}"');
    expect(backupScript).toContain('write_status success');
    expect(backupScript).toContain('write_status failed');
    expect(backupScript).toContain('mv "$status_temp" "$STATUS_FILE"');
    expect(backupScript).toContain("tail -n 1");
  });

  it("installs a persistent nightly database backup timer", () => {
    expect(installer).toContain("club-pwa-backup.timer");
    expect(installer).toContain("Persistent=true");
    expect(installer).toContain("RandomizedDelaySec=20m");
    expect(installer).toContain("systemctl enable --now club-pwa-backup.timer");
  });

  it("refreshes backup timers as part of a full production reconcile", () => {
    expect(updateWorker).toContain('install_operational_timers');
    expect(updateWorker).toContain('deploy/install-backup-timer.sh');
    const timerIndex = updateWorker.lastIndexOf("install_operational_timers");
    const healthIndex = updateWorker.lastIndexOf('current_phase="health"');
    expect(timerIndex).toBeGreaterThan(-1);
    expect(healthIndex).toBeGreaterThan(timerIndex);
  });

  it("restores the latest dump into a disposable isolated PostgreSQL container", () => {
    expect(verifyScript).toContain("postgres:16-alpine");
    expect(verifyScript).toContain("--network none");
    expect(verifyScript).toContain("trap cleanup EXIT");
    expect(verifyScript).toContain('[[ "$temp_dir" == /tmp/club-pwa-backup-verify.* ]]');
    expect(verifyScript).toContain("pg_restore");
    expect(verifyScript).toContain("pg_isready");
    expect(verifyScript).toContain("public.users");
    expect(verifyScript).toContain("--user 0:0");
    expect(verifyScript).toContain('docker cp "$temp_dir/latest.dump"');
    expect(verifyScript).not.toContain("chmod 0777");
  });

  it("installs persistent weekly restore verification", () => {
    expect(installer).toContain("club-pwa-backup-verify.timer");
    expect(installer).toContain("OnCalendar=Sun *-*-* 04:30:00");
    expect(installer).toContain("systemctl enable --now club-pwa-backup-verify.timer");
  });

  it("backs up Kuma SQLite safely and uploads it to private S3", () => {
    expect(kumaBackupScript).toContain("sqlite3 /app/data/kuma.db");
    expect(kumaBackupScript).toContain(".backup");
    expect(kumaBackupScript).toContain("docker cp");
    expect(kumaBackupScript).not.toContain("stop -t 20 uptime-kuma");
    expect(kumaBackupScript).not.toContain("--volumes-from");
    expect(kumaBackupScript).toContain("uploadOperationalBackup.ts");
    expect(kumaBackupScript).toContain("--user 0:0");
    expect(kumaBackupScript).toContain('[[ "$temp_dir" == /tmp/club-pwa-kuma-backup.* ]]');
    expect(operationalUploader).toContain('system/uptime-kuma-backups/');
    expect(operationalUploader).toContain("getObjectMetadata");
    expect(operationalUploader).toContain("deleteObject");
  });

  it("installs a persistent nightly Kuma backup timer", () => {
    expect(installer).toContain("club-pwa-kuma-backup.timer");
    expect(installer).toContain("OnCalendar=*-*-* 03:10:00");
    expect(installer).toContain("systemctl enable --now club-pwa-kuma-backup.timer");
  });

  it("alerts when any backup or restore unit fails", () => {
    expect(installer.match(/OnFailure=club-pwa-operational-alert@%n.service/g)).toHaveLength(3);
    expect(installer).toContain("club-pwa-operational-alert@.service");
    expect(installer).toContain("send-systemd-failure-alert.sh");
  });
});
