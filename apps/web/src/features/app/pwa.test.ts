import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import PwaInstallPrompt from "./PwaInstallPrompt.vue";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it("serves the web manifest with a single installable content type", () => {
    const nginx = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");

    expect(nginx).toContain("application/manifest+json webmanifest;");
    expect(nginx).not.toContain("add_header Content-Type application/manifest+json");
  });

  it("shows an in-app install prompt for supported browsers and iOS instructions", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");
    const prompt = readFileSync(resolve(process.cwd(), "src/features/app/PwaInstallPrompt.vue"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(app).toContain("PwaInstallPrompt");
    expect(prompt).toContain("beforeinstallprompt");
    expect(prompt).toContain("appinstalled");
    expect(prompt).toContain("standalone === true");
    expect(prompt).toContain("display-mode: standalone");
    expect(prompt).toContain("prompt()");
    expect(prompt).toContain("Safari");
    expect(prompt).toContain("На экран Домой");
    expect(styles).toContain("bottom: calc(var(--nav-space, 0rem) + 0.75rem);");
  });

  it("shows install guidance before login even when the native install prompt is not ready", async () => {
    vi.useFakeTimers();

    render(PwaInstallPrompt);
    await vi.advanceTimersByTimeAsync(400);
    await nextTick();

    expect(screen.getByRole("dialog", { name: "Установите Club как приложение" })).toBeTruthy();
    expect(screen.getByText(/Если кнопки установки нет/)).toBeTruthy();
  });
});
