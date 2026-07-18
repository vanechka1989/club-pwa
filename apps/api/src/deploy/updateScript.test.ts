import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => (existsSync(path) ? readFileSync(path, "utf-8") : "");
const updateScript = readSource(resolve(__dirname, "../../../../deploy/update.sh"));
const updateWorker = readSource(resolve(__dirname, "../../../../deploy/update-worker.sh"));
const deployStatus = readSource(resolve(__dirname, "../../../../deploy/status.sh"));
const ensureSwap = readSource(resolve(__dirname, "../../../../deploy/ensure-swap.sh"));
const deployWorkflow = readFileSync(resolve(__dirname, "../../../../.github/workflows/deploy.yml"), "utf-8");
const productionCompose = readFileSync(resolve(__dirname, "../../../../docker-compose.prod.yml"), "utf-8");
const serverInstall = readFileSync(resolve(__dirname, "../../../../deploy/server-install.sh"), "utf-8");
const adminRoutes = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf-8");
const s3Storage = readFileSync(resolve(__dirname, "../storage/s3.ts"), "utf-8");

describe("deploy update script", () => {
  it("starts a systemd worker that survives the initiating SSH session", () => {
    expect(updateScript).toContain("systemd-run");
    expect(updateScript).toContain("club-pwa-deploy.service");
    expect(updateScript).toContain("update-worker.sh");
    expect(updateScript).toContain("DEPLOY_ASYNC");
    expect(updateScript).not.toContain("git pull --ff-only");
    expect(updateScript).not.toContain("api.telegram.org");
    expect(updateScript).not.toContain("notify_deploy_start");
  });

  it("records only a commit that passed the production health check", () => {
    expect(updateWorker).toContain('DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/club-pwa-deploy}"');
    expect(updateWorker).toContain('DEPLOYED_COMMIT_FILE="$DEPLOY_STATE_DIR/deployed-commit"');
    expect(updateWorker).toContain("git pull --ff-only");
    expect(updateWorker).toContain("git diff --name-only");
    expect(updateWorker).toContain("wait_for_health");
    expect(updateWorker).toContain("write_deployed_commit");

    const healthIndex = updateWorker.lastIndexOf("wait_for_health");
    const markerIndex = updateWorker.lastIndexOf("write_deployed_commit");
    expect(healthIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(healthIndex);
  });

  it("restores previous application images when the new containers fail health verification", () => {
    expect(updateWorker).toContain("rollback_services() {");
    expect(updateWorker).toContain("if ! wait_for_health; then");
    expect(updateWorker).toContain("rollback_services");
    expect(updateWorker).toContain("--force-recreate");
  });

  it("updates web and api independently without restarting dependencies", () => {
    expect(updateWorker).toContain("deploy_web() {");
    expect(updateWorker).toContain("deploy_api() {");
    expect(updateWorker).toContain("up -d --no-deps web");
    expect(updateWorker).toContain("up -d --no-deps api");

    const webFunction = updateWorker.slice(
      updateWorker.indexOf("deploy_web() {"),
      updateWorker.indexOf("deploy_api() {")
    );
    expect(webFunction).not.toContain("run --rm migrate");
    expect(webFunction).not.toContain("--no-deps api");
  });

  it("reconciles only services that exist in the current production compose", () => {
    const fullDeployFunction = updateWorker.slice(
      updateWorker.indexOf("deploy_full() {"),
      updateWorker.indexOf("reload_caddy() {")
    );

    expect(fullDeployFunction).toContain("compose up -d postgres api web caddy");
    expect(fullDeployFunction).not.toContain("postgres redis api");
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
    expect(updateWorker).toContain("build_args=()");
    expect(updateWorker).toContain('if [[ "${DEPLOY_FORCE:-0}" == "1" ]]');
    expect(updateWorker).toContain("build_args+=(--no-cache)");
  });

  it("exposes deployment state and durable journal logs without reading application secrets", () => {
    expect(deployStatus).toContain('DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/club-pwa-deploy}"');
    expect(deployStatus).toContain('STATUS_FILE="$DEPLOY_STATE_DIR/status.env"');
    expect(deployStatus).toContain("journalctl");
    expect(deployStatus).toContain("club-pwa-deploy.service");
    expect(deployStatus).not.toContain("source .env");
  });

  it("creates swap only on small hosts without active swap", () => {
    expect(ensureSwap).toContain("MemTotal");
    expect(ensureSwap).toContain("/proc/swaps");
    expect(ensureSwap).toContain("DEPLOY_SWAP_SIZE_GB");
    expect(ensureSwap).toContain("swapon /swapfile");
    expect(ensureSwap).toContain("/etc/fstab");
  });

  it("reuses one API image for the application, migrations and upload permissions", () => {
    expect(productionCompose.match(/dockerfile: apps\/api\/Dockerfile/g)).toHaveLength(1);
    expect(productionCompose.match(/image: club-pwa-api:latest/g)).toHaveLength(3);
    expect(productionCompose).toContain("uploads-permissions:");
  });

  it("keeps GitHub SSH alive and installs Buildx on managed servers", () => {
    expect(deployWorkflow).toContain("timeout-minutes: 30");
    expect(deployWorkflow).toContain("ServerAliveInterval=20");
    expect(deployWorkflow).toContain("ServerAliveCountMax=30");
    expect(serverInstall).toContain("docker-buildx-plugin");
  });

  it("collects remote deployment diagnostics when the update command fails", () => {
    expect(deployWorkflow).toContain("Deployment command failed. Collecting remote diagnostics");
    expect(deployWorkflow).toContain("deploy/status.sh");
    expect(deployWorkflow).toContain("journalctl -u club-pwa-deploy.service");
    expect(deployWorkflow).toContain("docker compose -f docker-compose.prod.yml ps");
    expect(deployWorkflow).toContain("docker compose -f docker-compose.prod.yml logs --tail=120 api web caddy");
  });

  it("prunes only old dangling images after a verified deployment", () => {
    const healthIndex = updateWorker.lastIndexOf("wait_for_health");
    const pruneIndex = updateWorker.lastIndexOf("docker image prune");
    expect(updateWorker).toContain('until=72h');
    expect(pruneIndex).toBeGreaterThan(healthIndex);
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
    expect(s3Storage).toContain("options: { verifyReadable?: boolean; allowPublic?: boolean } = {}");
    expect(s3Storage).toContain("const verifyReadable = options.verifyReadable ?? false");
    expect(s3Storage).toContain("const allowPublic = options.allowPublic ?? false");
    expect(s3Storage).toContain("if (verifyReadable) {");
  });
});
