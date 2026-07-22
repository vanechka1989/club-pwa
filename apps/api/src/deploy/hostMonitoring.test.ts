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
    expect(sender).not.toContain("sendEmail");
    expect(sender).not.toContain("reserveEmailQuota");
  });

  it("installs the probe timer during production reconciliation", () => {
    expect(installer).toContain("OnUnitActiveSec=2min");
    expect(installer).toContain("Persistent=true");
    expect(installer).toContain("systemctl enable --now club-pwa-host-monitor.timer");
    expect(worker).toContain("deploy/install-host-monitor.sh");
  });
});
