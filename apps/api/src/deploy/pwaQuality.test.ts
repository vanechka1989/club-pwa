import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import releaseConfig from "../../../../playwright.release.config";

type WorkflowStep = { name?: string; run?: string; uses?: string; if?: string };
type WorkflowJob = {
  env?: Record<string, string | number>;
  services?: Record<string, { image?: string }>;
  steps: WorkflowStep[];
};

function loadWorkflow(fileName: string) {
  return parse(readFileSync(resolve(__dirname, `../../../../.github/workflows/${fileName}`), "utf8")) as {
    on: Record<string, unknown>;
    jobs: Record<string, WorkflowJob>;
  };
}

function stepIndex(steps: WorkflowStep[], name: string) {
  return steps.findIndex((step) => step.name === name);
}

describe("PWA browser regression workflow", () => {
  const pwaWorkflow = loadWorkflow("pwa-quality.yml");
  const deployWorkflow = loadWorkflow("deploy.yml");

  it("tests scheduled devices and retains browser failure artifacts", () => {
    const job = pwaWorkflow.jobs["browser-tests"]!;
    const commands = job.steps.flatMap((step) => step.run ? [step.run] : []);
    const artifact = job.steps.find((step) => step.uses === "actions/upload-artifact@v4");

    expect(pwaWorkflow.on).toHaveProperty("schedule");
    expect(commands).toContain("pnpm test:e2e:release");
    expect(commands).toContain("pnpm test:e2e:devices");
    expect(commands).toContain("pnpm exec playwright install --with-deps chromium firefox webkit");
    expect(artifact).toMatchObject({ if: "failure()" });
  });

  it("runs deterministic Chromium, Firefox, and WebKit release checks without retries", () => {
    const quality = deployWorkflow.jobs.quality!;
    expect(quality.steps.some((step) => step.run === "pnpm exec playwright install --with-deps chromium firefox webkit")).toBe(true);
    expect(quality.steps.some((step) => step.run === "pnpm test:e2e:release")).toBe(true);
    expect(releaseConfig.retries).toBe(0);
    expect(releaseConfig.projects?.map((project) => project.name)).toEqual([
      "release-desktop",
      "release-firefox",
      "release-android",
      "ios-safari-webkit"
    ]);
  });

  it("fails closed on a complete PostgreSQL, S3, and ClamAV integration gate", () => {
    const quality = deployWorkflow.jobs.quality!;
    const requiredEnvironment = [
      "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL",
      "COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL",
      "COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_RESERVE_BUCKET",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY",
      "COMMUNITY_UPLOAD_S3_INTEGRATION_REGION",
      "COMMUNITY_CLAMAV_INTEGRATION_HOST",
      "COMMUNITY_CLAMAV_INTEGRATION_PORT"
    ];
    expect(Object.keys(quality.env ?? {}).sort()).toEqual(requiredEnvironment.sort());
    expect(quality.services?.postgres?.image).toBe("postgres:16-alpine");

    const preflight = stepIndex(quality.steps, "Preflight community integration resources");
    const startServices = stepIndex(quality.steps, "Start community S3 and ClamAV release services");
    const externalGate = stepIndex(quality.steps, "Run community external integration gate");
    const fullTests = quality.steps.findIndex((step) => step.run === "pnpm test");
    expect(preflight).toBeGreaterThan(-1);
    expect(startServices).toBeGreaterThan(preflight);
    expect(externalGate).toBeGreaterThan(startServices);
    expect(fullTests).toBeGreaterThan(externalGate);

    const preflightScript = quality.steps[preflight]!.run ?? "";
    expect(preflightScript).toContain("MemAvailable");
    expect(preflightScript).toContain("df --output=avail");
    const gateCommand = quality.steps[externalGate]!.run ?? "";
    expect(gateCommand).toContain("--no-file-parallelism");
    expect(gateCommand).toContain("--maxWorkers=1");
    for (const suite of [
      "communityBola.postgres.test.ts",
      "communityRateLimits.postgres.test.ts",
      "messageMutationService.postgres.test.ts",
      "topicStateRepository.postgres.test.ts",
      "messageSearch.postgres.test.ts",
      "s3Config.postgres.test.ts",
      "s3ImmutablePromotion.integration.test.ts",
      "communitySecurityIntegration.test.ts"
    ]) {
      expect(gateCommand).toContain(suite);
    }
  });

  it("runs the release preparation gate before the external integration and deployment jobs", () => {
    const quality = deployWorkflow.jobs.quality!;
    const releaseGate = stepIndex(quality.steps, "Run release preparation gate");
    const externalGate = stepIndex(quality.steps, "Run community external integration gate");

    expect(releaseGate).toBeGreaterThan(-1);
    expect(quality.steps[releaseGate]?.run).toBe("pnpm test:release");
    expect(releaseGate).toBeLessThan(externalGate);
    expect(deployWorkflow.jobs.deploy).toBeDefined();
  });
});
