import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";

const appSource = readFileSync(resolve(__dirname, "App.vue"), "utf-8");
const appIndexSource = readFileSync(resolve(__dirname, "../index.html"), "utf-8");

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the app shell", () => {
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("button", { name: "Профиль" })).toBeTruthy();
  });

  it("resets window scroll when changing sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    await screen.getByRole("button", { name: "Модули" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("moves from admin to profile when owner previews member modes", () => {
    expect(appSource).toContain("handlePreviewModeChange");
    expect(appSource).toContain('mode === "member-active" || mode === "member-inactive"');
    expect(appSource).toContain('void selectSection("profile");');
    expect(appSource).toContain("@preview-mode-change=\"handlePreviewModeChange\"");
  });

  it("hides member-only sections when access is inactive", () => {
    expect(appSource).toContain("isSectionAvailable");
    expect(appSource).toContain("item.memberOnly");
    expect(appSource).toContain('session.user.membershipStatus !== "active"');
    expect(appSource).toContain('activeSection.value = "profile";');
  });

  it("shows a red mail marker on profile nav when app notifications are unread", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("startAppNotificationPolling");
    expect(appSource).toContain("notifications.loadAppNotifications");
    expect(appSource).toContain("notifications.unreadCount > 0");
    expect(appSource).toContain("✉");
    expect(appSource).toContain("bottom-nav-mail-badge");
    expect(styles).toContain(".bottom-nav-mail-badge");
    expect(styles).toContain("var(--danger)");
  });

  it("uses one combined alert when payment opens access", () => {
    expect(appSource).toContain("function showPaymentSuccessAlert");
    expect(appSource).toContain("Оплата прошла. Доступ открыт.");
    expect(appSource).toContain("if (readPaymentWatch())");
    expect(appSource).toContain("clearPaymentWatch();");
    expect(appSource).not.toContain("Оплата прошла. Доступ обновлен.");
  });

  it("keeps mobile fullscreen layouts on the measured Telegram viewport", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("club-telegram-webview");
    expect(appSource).toContain("getViewportSizeClasses");
    expect(appSource).toContain("getDeviceLayoutClasses");
    expect(appSource).toContain("syncLayoutClasses");
    expect(appSource).toContain("--tg-safe-left");
    expect(appSource).toContain("--tg-safe-right");
    expect(appSource).toContain("--tg-viewport-height");
    expect(appSource).toContain("--club-visible-viewport-height");
    expect(appSource).toContain("--club-visible-viewport-bottom");
    expect(styles).not.toContain("var(--tg-viewport-height, 100vh)");
    expect(styles).not.toContain("height: 100vh");
    expect(styles).not.toContain("calc(100vh");
    expect(styles).toContain("height: var(--club-viewport-height, 100dvh);");
    expect(styles).toContain("calc(var(--club-viewport-height, 100dvh) - var(--fullscreen-top-offset))");
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).toContain(".club-telegram-webview:not(.club-telegram-fullscreen) .app-shell");
    expect(styles).toContain("body.club-keyboard-open .community-chat-open .chat-room");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".payment-product-pay");
  });

  it("uses Telegram safe-area values with CSS env fallback", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const safeAreaSides = ["top", "right", "bottom", "left"];
    const unsafeSafeAreaLines = styles
      .split(/\r?\n/)
      .flatMap((line, index) =>
        safeAreaSides
          .filter((side) => line.includes(`env(safe-area-inset-${side})`) && !line.includes(`var(--tg-safe-${side}, env(safe-area-inset-${side}))`))
          .map((side) => `${index + 1}:${side}:${line.trim()}`)
      );

    expect(appIndexSource).toContain("viewport-fit=cover");
    expect(unsafeSafeAreaLines).toEqual([]);
  });

  it("uses adaptive typography and spacing tokens for the app shell", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--font-root: clamp(");
    expect(styles).toContain("--font-base: clamp(");
    expect(styles).toContain("--font-title: clamp(");
    expect(styles).toContain("--space-section: clamp(");
    expect(styles).toContain("--space-card: clamp(");
    expect(styles).toContain("font-size: var(--font-root);");
    expect(styles).toContain("font-size: var(--font-base);");
    expect(styles).toContain("padding-top: max(4.8rem, calc(var(--tg-safe-top, 0px) + var(--space-page-top)));");
    expect(styles).toContain("gap: var(--space-section);");
    expect(styles).toContain("padding: var(--space-card);");
  });

  it("uses a lower top offset for Samsung fullscreen webviews", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("body.club-samsung");
    expect(styles).toContain("--fullscreen-top-offset: 4.8rem");
  });

  it("keeps narrow Huawei webviews below Telegram top controls", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("body.club-huawei.club-screen-narrow");
    expect(styles).toContain("html.club-huawei.club-screen-narrow");
    expect(styles).toContain("font-size: 14px");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .app-root:not(.community-chat-open)");
    expect(styles).toContain("--nav-space: calc(6.7rem + var(--club-system-bottom, 0px))");
    expect(styles).toContain("--fullscreen-top-offset: max(8rem, calc(var(--tg-safe-top, 0px) + 5rem))");
    expect(styles).toContain("--chat-top-offset: max(8rem, calc(var(--tg-safe-top, 0px) + 5rem))");
    expect(styles).toContain("body.club-huawei.club-screen-narrow.club-telegram-webview:not(.club-telegram-fullscreen) .app-shell");
    expect(styles).toContain("padding-top: var(--fullscreen-top-offset)");
    expect(styles).toContain(".sr-only");
    expect(styles).toContain("position: absolute");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .bottom-nav-item-active");
    expect(styles).toContain("box-shadow: none");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .bottom-nav-mail-badge");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .chat-bubble");
    expect(styles).toContain("max-width: min(74%, 22rem)");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .chat-message-own .chat-bubble");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .chat-avatar");
    expect(styles).toContain("width: 1.75rem");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .soft-card");
    expect(styles).toContain("padding: 0.55rem");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .profile-info-row");
    expect(styles).toContain("min-height: 2.05rem");
    expect(styles).toMatch(
      /body\.club-huawei\.club-screen-narrow \.profile-subscription-meta\s*{[^}]*display: grid;[^}]*grid-template-columns: 1fr;[^}]*justify-content: flex-start;/s
    );
  });

  it("styles fullscreen video close control as a themed pill in portrait and landscape", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /\.lesson-video-exit-fullscreen-button\s*{[^}]*border-radius:\s*999px;[^}]*background:\s*color-mix\(in srgb, var\(--panel-strong\)/s
    );
    expect(styles).toMatch(/\.lesson-video-exit-fullscreen-button span\s*{[^}]*font-size:/s);
    expect(styles).toMatch(/@media \(orientation: landscape\)\s*{[^}]*\.lesson-video-exit-fullscreen-button/s);
  });
});
