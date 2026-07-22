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
});
