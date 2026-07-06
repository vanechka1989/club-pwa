import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(resolve(__dirname, "../../../../deploy/Caddyfile"), "utf-8");
const nginxConf = readFileSync(resolve(__dirname, "../../../../apps/web/nginx.conf"), "utf-8");
const serverInstall = readFileSync(resolve(__dirname, "../../../../deploy/server-install.sh"), "utf-8");
const sshInstall = readFileSync(resolve(__dirname, "../../../../deploy/install.sh"), "utf-8");
const publicInstall = readFileSync(resolve(__dirname, "../../../../apps/web/public/install-club.sh"), "utf-8");

describe("production security config", () => {
  it("sets browser security headers in both reverse proxy layers", () => {
    for (const source of [caddyfile, nginxConf]) {
      expect(source).toContain("Content-Security-Policy");
      expect(source).toContain("X-Content-Type-Options");
      expect(source).toContain("Referrer-Policy");
      expect(source).toContain("Permissions-Policy");
    }
  });

  it("configures email and PWA push env while protecting the env file in installers", () => {
    for (const source of [serverInstall, sshInstall, publicInstall]) {
      expect(source).toContain("OWNER_EMAIL");
      expect(source).toContain("SMTP_HOST");
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
      const seedIndex = source.indexOf("db:seed");

      expect(seedIndex).toBeGreaterThan(firstWaitIndex);
    }
  });
});
