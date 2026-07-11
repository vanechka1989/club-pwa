import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("login IP auth integration", () => {
  it("records the first IP after creating an email session", () => {
    const source = readFileSync(resolve(__dirname, "../routes/auth.ts"), "utf8");
    expect(source).toContain("getTrustedClientIp(c.req.raw.headers)");
    expect(source).toContain("recordLoginIpChange({");
    expect(source).toContain("sessionId: session.id");
  });

  it("records changed IPs only after a valid session is resolved", () => {
    const source = readFileSync(resolve(__dirname, "../middleware/auth.ts"), "utf8");
    const sessionGuard = source.indexOf("if (!session?.user)");
    const auditCall = source.indexOf("recordLoginIpChange({");
    expect(sessionGuard).toBeGreaterThan(-1);
    expect(auditCall).toBeGreaterThan(sessionGuard);
    expect(source).toContain("previousIpAddress: session.lastIpAddress");
  });
});
