import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA shell", () => {
  it("publishes a manifest and service worker from public assets", () => {
    const publicDir = resolve(process.cwd(), "public");
    const manifestPath = resolve(publicDir, "manifest.webmanifest");
    const workerPath = resolve(publicDir, "sw.js");

    expect(existsSync(manifestPath)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name: string;
      start_url: string;
      display: string;
      icons: unknown[];
    };
    const worker = readFileSync(workerPath, "utf8");

    expect(manifest.name).toContain("PWA");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(worker).toContain("push");
    expect(worker).toContain("notificationclick");
  });

  it("refreshes the shell without keeping old login HTML in the runtime cache", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

    expect(worker).toContain('const cacheName = "club-pwa-v2"');
    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).not.toContain('request.mode === "navigate" || request.url.includes("/assets/")');
  });

  it("registers the service worker and does not load Telegram WebApp script", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(main).toContain("serviceWorker.register");
    expect(html).toContain("manifest.webmanifest");
    expect(html).not.toContain("telegram.org/js/telegram-web-app.js");
  });
});
