import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const updateScript = readFileSync(resolve(__dirname, "../../../../deploy/update.sh"), "utf-8");
const deployWorkflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf-8");
const adminRoutes = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf-8");
const s3Storage = readFileSync(resolve(__dirname, "../storage/s3.ts"), "utf-8");

describe("deploy update script", () => {
  it("serializes deploys and updates after pulling the latest commit without bot notifications", () => {
    expect(updateScript).toContain("flock 9");
    expect(updateScript).toContain("/tmp/club-pwa-deploy.lock");
    expect(updateScript).toContain("Already up to date; deployment skipped.");
    expect(updateScript).not.toContain("api.telegram.org");
    expect(updateScript).not.toContain("notify_deploy_start");

    const gitPullIndex = updateScript.indexOf("git pull --ff-only");
    const buildIndex = updateScript.indexOf("docker compose -f docker-compose.prod.yml build");
    const skipIndex = updateScript.indexOf("Already up to date; deployment skipped.");

    expect(gitPullIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(skipIndex).toBeGreaterThan(gitPullIndex);
    expect(gitPullIndex).toBeLessThan(buildIndex);
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

  it("rebuilds Docker images without stale cache when deployment is forced", () => {
    expect(updateScript).toContain("build_args=()");
    expect(updateScript).toContain('if [[ "${DEPLOY_FORCE:-}" == "1" ]]; then');
    expect(updateScript).toContain("build_args+=(--no-cache)");
    expect(updateScript).toContain('docker compose -f docker-compose.prod.yml build "${build_args[@]}"');
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
    expect(adminRoutes).toContain('getObjectReadUrl(body.data.key, body.data.target ?? "primary", { verifyReadable: true })');
    expect(adminRoutes).toContain('deleteObject(body.data.key, body.data.target ?? "primary")');
  });
});

describe("direct learning S3 uploads", () => {
  it("creates signed upload URLs and saves uploaded objects by key", () => {
    expect(s3Storage).toContain("createObjectUploadUrl");
    expect(s3Storage).toContain("createMultipartUpload");
    expect(s3Storage).toContain("completeMultipartUpload");
    expect(s3Storage).toContain("UploadPartCommand");
    expect(s3Storage).toContain("PutObjectCommand");
    expect(s3Storage).toContain("getObjectMetadata");
    expect(adminRoutes).toContain('post("/learning/materials/uploads"');
    expect(adminRoutes).toContain('post("/learning/materials/uploads/multipart"');
    expect(adminRoutes).toContain('put("/learning/materials/uploads/multipart/part"');
    expect(adminRoutes).toContain('post("/learning/materials/uploads/multipart/complete"');
    expect(adminRoutes).toContain("uploadMultipartPart");
    expect(adminRoutes).toContain('post("/learning/materials/direct"');
    expect(adminRoutes).toContain('post("/learning/materials/:id/direct"');
    expect(adminRoutes).toContain("verifyDirectUploadedObject");
    expect(adminRoutes).toContain("mirrorDirectUploadToReserve");
  });

  it("keeps learning read URLs fast by skipping S3 HEAD checks by default", () => {
    expect(s3Storage).toContain("options: { verifyReadable?: boolean } = {}");
    expect(s3Storage).toContain("const verifyReadable = options.verifyReadable ?? false");
    expect(s3Storage).toContain("if (verifyReadable) {");
  });
});
