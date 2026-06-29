import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const updateScript = readFileSync(resolve(__dirname, "../../../../deploy/update.sh"), "utf-8");
const deployWorkflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf-8");

describe("deploy update script", () => {
  it("notifies Telegram before starting server update", () => {
    expect(updateScript).toContain("notify_deploy_start()");
    expect(updateScript).toContain("Обновление клуба началось.");

    const startNotifyIndex = updateScript.lastIndexOf("notify_deploy_start");
    const gitPullIndex = updateScript.indexOf("git pull --ff-only");
    const buildIndex = updateScript.indexOf("docker compose -f docker-compose.prod.yml build");

    expect(startNotifyIndex).toBeGreaterThan(-1);
    expect(gitPullIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(startNotifyIndex).toBeLessThan(gitPullIndex);
    expect(startNotifyIndex).toBeLessThan(buildIndex);
  });

  it("sends the start notification from GitHub Actions before the SSH update step", () => {
    const notifyStepIndex = deployWorkflow.indexOf("Notify update started");
    const updateStepIndex = deployWorkflow.indexOf("Update application");

    expect(notifyStepIndex).toBeGreaterThan(-1);
    expect(updateStepIndex).toBeGreaterThan(-1);
    expect(notifyStepIndex).toBeLessThan(updateStepIndex);
    expect(deployWorkflow).toContain("DEPLOY_NOTIFY_START_SENT: \"1\"");
  });
});
