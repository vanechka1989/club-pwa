import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => {
  const absolute = resolve(__dirname, `../../../../${path}`);
  return existsSync(absolute) ? readFileSync(absolute, "utf-8") : "";
};

describe("host capacity monitoring", () => {
  const probe = repoFile("scripts/check-host-capacity.sh");
  const installer = repoFile("deploy/install-host-monitor.sh");
  const worker = repoFile("deploy/update-worker.sh");
  const sender = repoFile("apps/api/src/operations/sendOperationalAlert.ts");
  const maintenance = repoFile("scripts/maintain-host-storage.sh");
  const maintenanceInstaller = repoFile("deploy/install-storage-maintenance.sh");

  it("checks bounded host and service signals and only alerts on transitions", () => {
    expect(probe).toContain("DISK_WARN_PERCENT");
    expect(probe).toContain("DISK_CRITICAL_PERCENT");
    expect(probe).toContain("DISK_EMERGENCY_PERCENT");
    expect(probe).toContain("MEMORY_AVAILABLE_WARN_MB");
    expect(probe).toContain("swap_used_percent");
    expect(probe).toContain("RestartCount");
    expect(probe).toContain("OOMKilled");
    expect(probe).toContain("postgres api web caddy uptime-kuma");
    expect(probe).toContain("previous_fingerprint");
    expect(probe).toContain("sendOperationalAlert.ts");
    expect(probe).not.toContain("docker ps --format");
    expect(sender).toContain("env.OWNER_EMAIL");
    expect(sender).toContain("nodemailer.createTransport");
    expect(sender).toContain("transporter.close()");
    expect(sender).not.toContain("sendEmail");
    expect(sender).not.toContain("reserveEmailQuota");
  });

  it("installs the probe timer during production reconciliation", () => {
    expect(installer).toContain("OnUnitActiveSec=2min");
    expect(installer).toContain("Persistent=true");
    expect(installer).toContain("systemctl enable --now club-pwa-host-monitor.timer");
    expect(worker).toContain("deploy/install-host-monitor.sh");
  });

  it("keeps host storage bounded without touching application data", () => {
    expect(maintenance).toContain("flock -n 9");
    expect(maintenance).toContain("docker builder prune -af --keep-storage 2GB");
    expect(maintenance).toContain("docker image prune -f --filter until=168h");
    expect(maintenance).toContain("journalctl --vacuum-size=150M");
    expect(maintenance).toContain("mv \"$status_tmp\" \"$STATUS_FILE\"");
    expect(maintenance).not.toContain("docker system prune");
    expect(maintenance).not.toContain("docker volume prune");
    expect(maintenance).not.toContain("docker container prune");
    expect(maintenance).not.toContain("rm -rf");
  });

  it("installs daily storage maintenance with operational failure alerts", () => {
    expect(maintenanceInstaller).toContain("OnCalendar=*-*-* 04:20:00");
    expect(maintenanceInstaller).toContain("Persistent=true");
    expect(maintenanceInstaller).toContain("OnFailure=club-pwa-operational-alert@%n.service");
    expect(maintenanceInstaller).toContain("systemctl enable --now club-pwa-storage-maintenance.timer");
    expect(worker).toContain("deploy/install-storage-maintenance.sh");
    expect(probe).toContain('DISK_WARN_PERCENT="${DISK_WARN_PERCENT:-70}"');
  });
});
