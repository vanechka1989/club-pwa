import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync(resolve(__dirname, "../../../../deploy/Caddyfile"), "utf-8");
const nginxConf = readFileSync(resolve(__dirname, "../../../../apps/web/nginx.conf"), "utf-8");
const serverInstall = readFileSync(resolve(__dirname, "../../../../deploy/server-install.sh"), "utf-8");
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

  it("generates a Telegram webhook secret and protects the env file in installers", () => {
    for (const source of [serverInstall, publicInstall]) {
      expect(source).toContain("TELEGRAM_WEBHOOK_SECRET");
      expect(source).toContain("chmod 600");
    }
  });
});
