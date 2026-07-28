import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(resolve(__dirname, "../../../../deploy/Caddyfile"), "utf-8");
const scaleCaddyfile = readFileSync(resolve(__dirname, "../../../../deploy/Caddyfile.scale"), "utf-8");
const nginxConf = readFileSync(resolve(__dirname, "../../../../apps/web/nginx.conf"), "utf-8");
const serverInstall = readFileSync(resolve(__dirname, "../../../../deploy/server-install.sh"), "utf-8");
const sshInstall = readFileSync(resolve(__dirname, "../../../../deploy/install.sh"), "utf-8");
const publicInstall = readFileSync(resolve(__dirname, "../../../../apps/web/public/install-club.sh"), "utf-8");
const apiDockerfile = readFileSync(resolve(__dirname, "../../../../apps/api/Dockerfile"), "utf-8");
const webDockerfile = readFileSync(resolve(__dirname, "../../../../apps/web/Dockerfile"), "utf-8");
const productionCompose = readFileSync(resolve(__dirname, "../../../../docker-compose.prod.yml"), "utf-8");
const scaleCompose = readFileSync(resolve(__dirname, "../../../../docker-compose.scale.yml"), "utf-8");
const updateWorker = readFileSync(resolve(__dirname, "../../../../deploy/update-worker.sh"), "utf-8");
const communityUploadOperations = readFileSync(resolve(__dirname, "../../../../docs/operations/community-uploads.md"), "utf-8");
const apiPackage = JSON.parse(readFileSync(resolve(__dirname, "../../../../apps/api/package.json"), "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("production security config", () => {
  it("sets browser security headers in both reverse proxy layers", () => {
    for (const source of [caddyfile, nginxConf]) {
      expect(source).toContain("Content-Security-Policy");
      expect(source).toContain("X-Content-Type-Options");
      expect(source).toContain("X-Frame-Options");
      expect(source).toContain("Referrer-Policy");
      expect(source).toContain("Permissions-Policy");
      expect(source).not.toContain("microphone=()");
    }
    expect(caddyfile).toContain("Strict-Transport-Security");
    expect(publicInstall).toContain("Strict-Transport-Security");
  });

  it("configures email and PWA push env while protecting the env file in installers", () => {
    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("OWNER_EMAIL");
      expect(source).toContain("SMTP_HOST");
      expect(source).toContain("MAILING_UNSUBSCRIBE_SECRET");
      expect(source).toContain("WEB_PUSH_PUBLIC_KEY");
      expect(source).toContain("chmod 600");
    }
  });

  it("generates PWA push VAPID keys automatically during installation", () => {
    expect(serverInstall).toContain("generate_vapid_keys");
    expect(publicInstall).toContain("generate_vapid_keys");
    expect(sshInstall).toContain("generate_remote_vapid_keys");

    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("node:22-alpine");
      expect(source).toContain("WEB_PUSH_PRIVATE_KEY");
      expect(source).toContain("Генерируем Web Push VAPID ключи");
    }
  });

  it("does not prompt for a GitHub token when installing from a public repository", () => {
    for (const source of [serverInstall, sshInstall]) {
      expect(source).not.toContain('prompt_secret "GitHub token');
      expect(source).not.toContain("GitHub token нужен");
    }
  });

  it("explains production prerequisites and SMTP inputs in the installers", () => {
    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("Перед началом подготовьте");
      expect(source).toContain("SMTP пример Timeweb");
      expect(source).toContain("smtp.timeweb.ru");
      expect(source).toContain("Club <club@myn8nservertest.ru>");
      expect(source).toContain("PWA push-ключи создаются автоматически");
    }
  });

  it("waits for the API before adding demo content", () => {
    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("wait_for_api_container");

      const firstWaitIndex = source.indexOf("wait_for_api_container");
      const seedIndex = source.indexOf("bun apps/api/src/db/seed.ts");

      expect(seedIndex).toBeGreaterThan(firstWaitIndex);
    }
  });

  it("keeps local upload fallback data in a persistent installer volume", () => {
    expect(publicInstall).toContain("- api-uploads:/app/uploads");
    expect(publicInstall).toContain("api-uploads:");
  });

  it("runs application containers without root and with restricted runtime privileges", () => {
    expect(apiDockerfile).toContain("USER bun");
    expect(webDockerfile).toContain("nginxinc/nginx-unprivileged");
    expect(webDockerfile).toContain("ENV NODE_OPTIONS=--max-old-space-size=768");
    for (const source of [productionCompose, scaleCompose]) {
      expect(source).toContain("no-new-privileges:true");
      expect(source).toContain("cap_drop:");
      expect(source).toContain("read_only: true");
    }
  });

  it("copies only the API production dependency tree into the runtime image", () => {
    expect(apiDockerfile).toContain("pnpm --filter @club/api deploy --prod /app/deploy/apps/api");
    expect(apiDockerfile).toContain("COPY --from=dependencies --chown=bun:bun /app/deploy/apps/api ./apps/api");
    expect(apiDockerfile).not.toContain("/app/node_modules ./node_modules");
    expect(apiDockerfile).not.toContain("/app/packages ./packages");
  });

  it("keeps the production migration runner in the deployed dependency tree", () => {
    expect(apiPackage.dependencies?.["drizzle-kit"]).toBeTruthy();
    expect(apiPackage.devDependencies?.["drizzle-kit"]).toBeUndefined();
  });

  it("repairs an existing upload volume before starting the non-root API", () => {
    for (const source of [productionCompose, scaleCompose, publicInstall]) {
      expect(source).toContain("uploads-permissions:");
      expect(source).toContain('entrypoint: ["chown"]');
      expect(source).toContain('command: ["-R", "bun:bun", "/app/uploads"]');
      expect(source).toContain("cap_add:");
      expect(source).toContain("- CHOWN");
    }
    expect(updateWorker).toContain("compose run --rm uploads-permissions");
    expect(serverInstall).toContain("docker compose -f docker-compose.prod.yml run --rm uploads-permissions");
    expect(sshInstall).toContain("docker compose -f docker-compose.prod.yml run --rm uploads-permissions");
  });

  it("overrides the Bun image entrypoint for maintenance commands", () => {
    for (const source of [productionCompose, scaleCompose, publicInstall]) {
      expect(source).toContain('working_dir: /app/apps/api');
      expect(source).toContain('entrypoint: ["bun"]');
      expect(source).toContain('command: ["node_modules/drizzle-kit/bin.cjs", "migrate"]');
      expect(source).not.toContain('entrypoint: ["pnpm"]');
    }
  });

  it("runs seed scripts through Bun available to the non-root runtime user", () => {
    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("bun apps/api/src/db/seed.ts");
      expect(source).not.toContain("exec -T api pnpm");
    }
  });

  it("pins PgBouncer instead of following a mutable latest tag", () => {
    expect(scaleCompose).toContain("edoburu/pgbouncer:v1.25.2-p0");
    expect(scaleCompose).not.toContain("edoburu/pgbouncer:latest");
  });

  it("keeps external monitoring out of the application runtime", () => {
    expect(productionCompose).not.toContain("uptime-kuma:");
    expect(productionCompose).not.toContain("uptime-kuma-data");
    expect(productionCompose).not.toContain("/var/run/docker.sock");
    expect(caddyfile).not.toContain(":8443");
    expect(caddyfile).not.toContain("uptime-kuma");
  });

  it("bounds production service resources so one container cannot exhaust the VPS", () => {
    for (const service of ["postgres:", "api:", "web:", "caddy:"]) {
      const start = productionCompose.indexOf(`  ${service}`);
      expect(start).toBeGreaterThan(-1);
      const rest = productionCompose.slice(start + 2);
      const next = rest.search(/\n  [a-z][a-z-]*:\n/);
      const block = next === -1 ? rest : rest.slice(0, next);
      expect(block).toContain("mem_limit:");
      expect(block).toContain("cpus:");
      expect(block).toContain("pids_limit:");
    }
  });

  it("runs ClamAV as a private, persistent, resource-bounded quarantine sidecar", () => {
    for (const source of [productionCompose, scaleCompose]) {
      const start = source.indexOf("  clamav:\n");
      expect(start).toBeGreaterThan(-1);
      const rest = source.slice(start + 2);
      const next = rest.search(/\n  [a-z][a-z0-9-]*:\n/);
      const block = next === -1 ? rest : rest.slice(0, next);
      expect(block).toContain("image: clamav/clamav:1.4");
      expect(block).toContain('expose:\n      - "3310"');
      expect(block).toContain("healthcheck:");
      expect(block).toContain("mem_limit: ${CLAMAV_MEMORY_LIMIT:-4g}");
      expect(block).toContain("mem_reservation: 3g");
      expect(block).not.toContain("mem_limit: 768m");
      expect(block).toContain("pids_limit: 256");
      expect(block).toContain("clamav-signatures:/var/lib/clamav");
      expect(block).not.toContain("ports:");
      expect(source).toContain("CLAMAV_HOST: clamav");
      expect(source).toContain("CLAMAV_PORT: 3310");
    }
    expect(communityUploadOperations).toContain("AbortIncompleteMultipartUpload");
    expect(communityUploadOperations).toContain("4 GiB");
    expect(communityUploadOperations).toContain("community/pending/");
    expect(communityUploadOperations).toContain("community/quarantine/");
    expect(communityUploadOperations).toContain("community/final/");
  });

  it("isolates bounded media jobs from externally served API processes", () => {
    for (const source of [productionCompose, scaleCompose]) {
      const workerStart = source.indexOf("  worker:\n");
      expect(workerStart).toBeGreaterThan(-1);
      const workerBlock = source.slice(workerStart, source.indexOf("\n  migrate:\n", workerStart));
      expect(workerBlock).toContain("RUN_BACKGROUND_JOBS: true");
      expect(workerBlock).toContain("mem_limit: 1g");
      expect(workerBlock).toContain('cpus: "1.00"');
      expect(workerBlock).toContain("pids_limit: 256");
    }
    const productionApi = productionCompose.slice(productionCompose.indexOf("  api: &api-service\n"), productionCompose.indexOf("\n  worker:\n"));
    expect(productionApi).toContain("RUN_BACKGROUND_JOBS: false");
    expect(scaleCompose).toContain("api-1:");
    expect(scaleCompose).toContain("api-2:");
    expect(scaleCompose.match(/RUN_BACKGROUND_JOBS: false/g)).toHaveLength(3);
  });

  it("allows the API time to drain requests during deployment", () => {
    const apiStart = productionCompose.indexOf("  api: &api-service\n");
    const apiEnd = productionCompose.indexOf("\n  migrate:\n", apiStart);
    expect(productionCompose.slice(apiStart, apiEnd)).toContain("stop_grace_period: 30s");
  });

  it("bounds avatar and support streams before the general API handler without limiting lessons", () => {
    for (const source of [caddyfile, scaleCaddyfile]) {
      expect(source).toContain("@avatarUpload path /api/me/avatar/upload");
      expect(source).toContain("@supportUpload {");
      expect(source).toContain("path /api/support/uploads/*");
      expect(source).toContain("method PUT");
      expect(source).toContain("max_size 11MB");
      expect(source).toContain("max_size 53MB");
      expect(source.indexOf("handle @avatarUpload")).toBeLessThan(source.indexOf("handle_path /api/*"));
      expect(source.indexOf("handle @supportUpload")).toBeLessThan(source.indexOf("handle_path /api/*"));
      expect(source).not.toContain("@learningUpload");
    }
  });
});
