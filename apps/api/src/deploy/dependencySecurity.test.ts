import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dependency security automation", () => {
  it("blocks deployment on high-severity production advisories and schedules updates", () => {
    const rootPackage = readFileSync(resolve(__dirname, "../../../../package.json"), "utf8");
    const deploy = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf8");
    expect(rootPackage).toContain('"audit:prod"');
    expect(deploy).toContain("pnpm audit:prod");
    expect(existsSync(resolve(__dirname, "../../../../.github/dependabot.yml"))).toBe(true);
  });
});
