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
const obsoleteKumaBackupExists = existsSync(resolve(__dirname, "../../../../scripts/backup-uptime-kuma-s3.sh"));

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
    expect(verifyScript).toContain("pg_restore --version");
    expect(verifyScript).toContain('restore_image="postgres:${pg_restore_major}-alpine"');
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

  it("retires the obsolete application-host Kuma backup timer", () => {
    expect(installer).toContain("systemctl disable --now club-pwa-kuma-backup.timer");
    expect(installer).toContain('rm -f "$KUMA_SERVICE_FILE" "$KUMA_TIMER_FILE"');
    expect(installer).not.toContain("ExecStart=/usr/bin/env bash $DEPLOY_DIR/scripts/backup-uptime-kuma-s3.sh");
    expect(installer).not.toContain("systemctl enable --now club-pwa-kuma-backup.timer");
    expect(obsoleteKumaBackupExists).toBe(false);
  });

  it("alerts when any backup or restore unit fails", () => {
    expect(installer.match(/OnFailure=club-pwa-operational-alert@%n.service/g)).toHaveLength(2);
    expect(installer).toContain("club-pwa-operational-alert@.service");
    expect(installer).toContain("send-systemd-failure-alert.sh");
    expect(installer).toContain("TimeoutStartSec=2min");
  });
});
