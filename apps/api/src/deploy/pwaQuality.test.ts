import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA browser regression workflow", () => {
  const path = resolve(__dirname, "../../../../.github/workflows/pwa-quality.yml");
  const workflow = existsSync(path) ? readFileSync(path, "utf-8") : "";

  it("tests Android and iPhone-sized layouts and preserves failure artifacts", () => {
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("pnpm test:e2e:full");
    expect(workflow).toContain("pnpm test:e2e");
    expect(workflow).toContain("playwright install --with-deps chromium webkit");
    expect(workflow).toContain("actions/upload-artifact@v4");
    expect(workflow).toContain("playwright-report/");
    expect(workflow).toContain("test-results/");
  });
});
