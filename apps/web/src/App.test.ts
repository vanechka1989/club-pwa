import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.vue";

const appSource = readFileSync(resolve(__dirname, "App.vue"), "utf-8");

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
});
