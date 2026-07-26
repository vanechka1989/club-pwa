import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dependency security automation", () => {
  it("blocks deployment with a SHA-pinned high-severity scanner and schedules updates", () => {
    const deploy = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf8");
    expect(deploy).toContain("aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25");
    expect(deploy).toContain("severity: HIGH,CRITICAL");
    expect(deploy).toContain("exit-code: 1");
    expect(deploy).not.toContain("pnpm audit:prod");
    expect(existsSync(resolve(__dirname, "../../../../.github/dependabot.yml"))).toBe(true);
  });
});
