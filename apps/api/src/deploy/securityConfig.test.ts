import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(resolve(__dirname, "../../../../deploy/Caddyfile"), "utf-8");
const nginxConf = readFileSync(resolve(__dirname, "../../../../apps/web/nginx.conf"), "utf-8");
const serverInstall = readFileSync(resolve(__dirname, "../../../../deploy/server-install.sh"), "utf-8");
const sshInstall = readFileSync(resolve(__dirname, "../../../../deploy/install.sh"), "utf-8");
const publicInstall = readFileSync(resolve(__dirname, "../../../../apps/web/public/install-club.sh"), "utf-8");
const apiDockerfile = readFileSync(resolve(__dirname, "../../../../apps/api/Dockerfile"), "utf-8");
const webDockerfile = readFileSync(resolve(__dirname, "../../../../apps/web/Dockerfile"), "utf-8");
const productionCompose = readFileSync(resolve(__dirname, "../../../../docker-compose.prod.yml"), "utf-8");
const scaleCompose = readFileSync(resolve(__dirname, "../../../../docker-compose.scale.yml"), "utf-8");
const updateWorker = readFileSync(resolve(__dirname, "../../../../deploy/update-worker.sh"), "utf-8");

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

  it("runs Uptime Kuma as an isolated rootless monitoring service", () => {
    expect(productionCompose).toContain("louislam/uptime-kuma:2-rootless@sha256:a23b9d0029e6f1bc4a0fea0f3ee306d51f43216cd9f8115f8d84d146e9411e4c");
    expect(productionCompose).toContain("uptime-kuma-data:/app/data");
    expect(productionCompose).toContain("mem_limit: 384m");
    expect(productionCompose).toContain('cpus: "0.50"');
    expect(productionCompose).toContain("pids_limit: 256");
    expect(productionCompose).not.toContain("/var/run/docker.sock");
    expect(caddyfile).toContain("https://{$PUBLIC_DOMAIN}:8443");
    expect(caddyfile).toContain("reverse_proxy uptime-kuma:3001");
  });
});
