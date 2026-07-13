import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
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
    expect(manifest.start_url).toBe("/?source=pwa");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(worker).toContain("push");
    expect(worker).toContain("notificationclick");
  });

  it("refreshes the shell without keeping old login HTML in the runtime cache", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

    expect(worker).toContain('const cacheName = "club-pwa-v98"');
    expect(worker).toContain('if (request.mode === "navigate")');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
    expect(worker).not.toContain('request.mode === "navigate" || request.url.includes("/assets/")');
    expect(worker).not.toContain('cached || caches.match("/")');
  });

  it("registers the service worker and does not load Telegram WebApp script", () => {
    const main = readFileSync(resolve(process.cwd(), "src/main.ts"), "utf8");
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(main).toContain("navigator.serviceWorker");
    expect(main).toContain('.register("/sw.js", { updateViaCache: "none" })');
    expect(main).toContain("registration.update()");
    expect(main).toContain('updateViaCache: "none"');
    expect(main).toContain("visibilitychange");
    expect(main).toContain("SKIP_WAITING");
    expect(html).toContain("manifest.webmanifest");
    expect(html).not.toContain("telegram.org/js/telegram-web-app.js");
  });

  it("locks the PWA viewport so mobile app screens cannot be pinch-scaled like a web page", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

    expect(html).toContain("width=device-width");
    expect(html).toContain("initial-scale=1.0");
    expect(html).toContain("maximum-scale=1.0");
    expect(html).toContain("user-scalable=no");
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("interactive-widget=resizes-content");
  });

  it("serves the web manifest with a single installable content type", () => {
    const nginx = readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");

    expect(nginx).toContain("application/manifest+json webmanifest;");
    expect(nginx).not.toContain("add_header Content-Type application/manifest+json");
  });

  it("shows an in-app install prompt for supported browsers and iOS instructions", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");
    const prompt = readFileSync(resolve(process.cwd(), "src/features/app/PwaInstallPrompt.vue"), "utf8");
    const guide = readFileSync(resolve(process.cwd(), "src/features/app/installPlatform.ts"), "utf8");
    const display = readFileSync(resolve(process.cwd(), "src/features/app/pwaDisplay.ts"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(app).toContain("PwaInstallPrompt");
    expect(prompt).toContain("beforeinstallprompt");
    expect(prompt).toContain("appinstalled");
    expect(prompt).toContain("isInstalledPwaDisplay");
    expect(display).toContain("standalone");
    expect(display).toContain("window-controls-overlay");
    expect(display).toContain("navigatorWithStandalone.standalone === true");
    expect(display).toContain('searchParams.get("source") === "pwa"');
    expect(display).toContain("club-pwa-installed");
    expect(display).toContain("isNonBrowserDisplaySurface");
    expect(display).toContain("display-mode: ${mode}");
    expect(prompt).toContain("prompt()");
    expect(prompt).toContain("detectInstallPlatform");
    expect(prompt).not.toContain("/iphone|ipad|ipod/i.test(userAgent)");
    expect(guide).toContain("Safari iPhone");
    expect(guide).toContain("Chrome Android");
    expect(guide).toContain("Edge Windows");
    expect(guide).toContain("Safari macOS");
    expect(guide).toContain("На экран Домой");
    expect(styles).toContain("bottom: calc(var(--nav-space, 0rem) + 0.75rem);");
  });

  it("asks for PWA push permission after login through a user action", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");
    const prompt = readFileSync(resolve(process.cwd(), "src/features/app/PushPermissionPrompt.vue"), "utf8");
    const notifications = readFileSync(resolve(process.cwd(), "src/stores/notifications.ts"), "utf8");

    expect(app).toContain("PushPermissionPrompt");
    expect(prompt).toContain("club-push-onboarding-dismissed-v1");
    expect(prompt).toContain('Notification.permission !== "default"');
    expect(prompt).toContain("@click=\"enablePush\"");
    expect(prompt).toContain("notifications.enableBrowserPush()");
    expect(notifications).toContain("Notification.requestPermission()");

    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    expect(prompt).toContain("push-permission-layer");
    expect(styles).toContain(".push-permission-layer");
    expect(styles).toContain("place-items: center");
    expect(styles).toContain("background: rgb(2 6 23 / 54%)");
  });

  it("shows install guidance before login even when the native install prompt is not ready", async () => {
    vi.useFakeTimers();

    render(PwaInstallPrompt);
    await vi.advanceTimersByTimeAsync(400);
    await nextTick();

    expect(screen.getByRole("complementary", { name: "Установите Club на Windows" })).toBeTruthy();
    expect(screen.getByText(/Откройте сайт в Chrome или Edge/)).toBeTruthy();
  });

  it("can hide the floating install card while still listening for install requests", async () => {
    vi.useFakeTimers();

    render(PwaInstallPrompt, { props: { showCard: false } });
    await vi.advanceTimersByTimeAsync(400);
    await nextTick();

    expect(screen.queryByRole("complementary", { name: "Установите Club на Windows" })).toBeNull();
  });

  it("opens the native install prompt when the login gate requests installation", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted"; platform: string }>;
      platforms: string[];
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
    event.platforms = ["web"];

    render(PwaInstallPrompt, { props: { showCard: false } });
    window.dispatchEvent(event);
    window.dispatchEvent(new CustomEvent("club-pwa-install-request"));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
  });
});
