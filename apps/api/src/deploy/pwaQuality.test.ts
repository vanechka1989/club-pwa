import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA browser regression workflow", () => {
  const path = resolve(__dirname, "../../../../.github/workflows/pwa-quality.yml");
  const workflow = existsSync(path) ? readFileSync(path, "utf-8") : "";
  const deployWorkflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf-8");
  const releaseConfigPath = resolve(__dirname, "../../../../playwright.release.config.ts");
  const deviceConfigPath = resolve(__dirname, "../../../../playwright.device.config.ts");

  it("tests Android and iPhone-sized layouts and preserves failure artifacts", () => {
    expect(workflow).toContain("schedule:");
    expect(existsSync(deviceConfigPath)).toBe(true);
    expect(workflow).toContain("pnpm test:e2e:devices");
    expect(workflow).toContain("pnpm test:e2e:release");
    expect(workflow).toContain("playwright install --with-deps chromium webkit");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("playwright-report/");
    expect(workflow).toContain("test-results/");
  });

  it("blocks deployment until focused Chromium and WebKit release checks pass", () => {
    expect(existsSync(releaseConfigPath)).toBe(true);
    expect(deployWorkflow).toContain("playwright install --with-deps chromium webkit");
    expect(deployWorkflow).toContain("pnpm test:e2e:release");
  });
});
