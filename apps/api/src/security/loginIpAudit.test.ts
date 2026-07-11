import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { shouldRecordLoginIpChange } from "./loginIpPolicy";

describe("login IP audit", () => {
  it("writes only when a valid IP differs from the session IP", () => {
    expect(shouldRecordLoginIpChange(null, "203.0.113.1")).toBe(true);
    expect(shouldRecordLoginIpChange("203.0.113.1", "203.0.113.1")).toBe(false);
    expect(shouldRecordLoginIpChange("203.0.113.1", "203.0.113.2")).toBe(true);
    expect(shouldRecordLoginIpChange("203.0.113.1", null)).toBe(false);
  });

  it("upserts returning IPs and increments their login count", () => {
    const source = readFileSync(resolve(__dirname, "loginIpAudit.ts"), "utf8");
    expect(source).toContain("onConflictDoUpdate");
    expect(source).toContain("target: [userLoginIps.userId, userLoginIps.ipAddress]");
    expect(source).toMatch(/loginCount:\s*sql`\$\{userLoginIps\.loginCount\} \+ 1`/);
    expect(source).toContain("lastIpAddress: ipAddress");
  });
});
