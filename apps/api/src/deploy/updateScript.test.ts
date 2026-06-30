import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const updateScript = readFileSync(resolve(__dirname, "../../../../deploy/update.sh"), "utf-8");
const deployWorkflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf-8");
const adminRoutes = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf-8");
const s3Storage = readFileSync(resolve(__dirname, "../storage/s3.ts"), "utf-8");

describe("deploy update script", () => {
  it("serializes deploys and notifies Telegram after pulling the latest commit", () => {
    expect(updateScript).toContain("flock 9");
    expect(updateScript).toContain("/tmp/club-crm-deploy.lock");
    expect(updateScript).toContain("notify_deploy_start()");
    expect(updateScript).toContain("Обновление клуба началось.");
    expect(updateScript).toContain("Already up to date; deployment skipped.");

    const startNotifyIndex = updateScript.lastIndexOf("notify_deploy_start");
    const gitPullIndex = updateScript.indexOf("git pull --ff-only");
    const buildIndex = updateScript.indexOf("docker compose -f docker-compose.prod.yml build");
    const skipIndex = updateScript.indexOf("Already up to date; deployment skipped.");

    expect(startNotifyIndex).toBeGreaterThan(-1);
    expect(gitPullIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(skipIndex).toBeGreaterThan(gitPullIndex);
    expect(gitPullIndex).toBeLessThan(startNotifyIndex);
    expect(startNotifyIndex).toBeLessThan(buildIndex);
  });

  it("lets the server update script own start notifications in GitHub Actions", () => {
    const notifyStepIndex = deployWorkflow.indexOf("Notify update started");
    const updateStepIndex = deployWorkflow.indexOf("Update application");

    expect(notifyStepIndex).toBe(-1);
    expect(updateStepIndex).toBeGreaterThan(-1);
    expect(deployWorkflow).not.toContain("DEPLOY_NOTIFY_START_SENT");
    expect(deployWorkflow).not.toContain("git pull --ff-only && DEPLOY_NOTIFY_START_SENT");
    expect(deployWorkflow).toContain("DEPLOY_DIR='$DEPLOY_DIR' bash '$DEPLOY_DIR/deploy/update.sh'");
  });
});

describe("admin S3 storage target routing", () => {
  it("routes object operations to primary or reserve S3", () => {
    expect(s3Storage).toContain('export type S3StorageTarget = "primary" | "reserve"');
    expect(s3Storage).toContain("resolveS3TargetConfig");
    expect(s3Storage).toContain('target === "reserve"');
    expect(adminRoutes).toContain('target: z.enum(["primary", "reserve"]).optional()');
    expect(adminRoutes).toContain('c.req.query("target")');
    expect(adminRoutes).toContain("listObjects({ prefix, cursor, limit: 50, target })");
    expect(adminRoutes).toContain('getObjectReadUrl(body.data.key, body.data.target ?? "primary")');
    expect(adminRoutes).toContain('deleteObject(body.data.key, body.data.target ?? "primary")');
  });
});
