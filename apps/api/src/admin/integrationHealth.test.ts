import { describe, expect, it } from "vitest";
import { buildConfiguredIntegrationHealth } from "./integrationHealth";

describe("integration health", () => {
  it("does not expose secrets and distinguishes missing configuration", () => {
    const checks = buildConfiguredIntegrationHealth({
      smtp: { host: "smtp.example.com", port: 465, user: "club", password: "secret" },
      s3: { endpoint: undefined, bucket: undefined, accessKeyId: undefined, secretAccessKey: undefined },
      payment: { enabled: true, hasSecret: true },
      realtime: { enabled: true, subscriberCount: 0 }
    });

    expect(checks.find((check) => check.id === "smtp")?.status).toBe("healthy");
    expect(checks.find((check) => check.id === "s3")?.status).toBe("warning");
    expect(JSON.stringify(checks)).not.toContain("secret");
  });
});
