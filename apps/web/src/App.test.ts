import type { ClubUser } from "@club/shared";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLearningHome,
  getMe,
  getPaymentHistory,
  getPaymentPlans,
  getReferralProfile,
  getSupportUnreadCount,
  logoutSession,
  updateDeviceDiagnostics
} from "@/api/client";
import App from "./App.vue";

const appSource = readFileSync(resolve(__dirname, "App.vue"), "utf-8");
const appIndexSource = readFileSync(resolve(__dirname, "../index.html"), "utf-8");

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    getLearningHome: vi.fn(),
    getMe: vi.fn(),
    getPaymentHistory: vi.fn(),
    getPaymentPlans: vi.fn(),
    getReferralProfile: vi.fn(),
    getSupportUnreadCount: vi.fn(),
    logoutSession: vi.fn(),
    updateDeviceDiagnostics: vi.fn()
  };
});

function testUser(overrides: Partial<ClubUser> = {}): ClubUser {
  return {
    id: "member-id",
    telegramId: "member@example.com",
    email: "member@example.com",
    firstName: "Иван",
    username: "member@example.com",
    photoUrl: null,
    role: "member",
    realRole: "member",
    adminRoleLabel: null,
    adminPermissions: [],
    membershipStatus: "active",
    membershipExpiresAt: null,
    paymentType: "manual",
    recurrentPaymentStatus: null,
    nextPaymentAt: null,
    avatarRefreshedAt: null,
    ...overrides
  };
}

function testDeviceDiagnostics() {
  return {
    capturedAt: "2026-07-06T00:00:00.000Z",
    platform: null,
    colorScheme: null,
    userAgent: "vitest",
    screen: {
      width: null,
      height: null,
      availWidth: null,
      availHeight: null,
      pixelRatio: null
    },
    viewport: {
      width: null,
      height: null
    },
    visualViewport: null,
    telegram: {
      version: null,
      platform: null,
      viewportHeight: null,
      viewportStableHeight: null,
      safeAreaInset: null,
      contentSafeAreaInset: null
    },
    classes: []
  };
}

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(getLearningHome).mockRejectedValue(new Error("not loaded"));
    vi.mocked(getMe).mockRejectedValue(new Error("unauthorized"));
    vi.mocked(getPaymentHistory).mockResolvedValue({ orders: [] });
    vi.mocked(getPaymentPlans).mockResolvedValue({ plans: [], provider: null, products: [], recurrentSubscriptions: [] });
    vi.mocked(getReferralProfile).mockRejectedValue(new Error("not loaded"));
    vi.mocked(getSupportUnreadCount).mockResolvedValue({ unreadCount: 0 });
    vi.mocked(logoutSession).mockResolvedValue({ ok: true });
    vi.mocked(updateDeviceDiagnostics).mockResolvedValue({ ok: true, device: testDeviceDiagnostics() });
  });

  it("renders email login when no session is present", async () => {
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(await screen.findByRole("heading", { name: "Вход в клуб" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Получить код" })).toBeTruthy();
  });

  it("resets window scroll when changing sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.mocked(getMe).mockResolvedValue({ user: testUser() });

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Модули" })).toBeTruthy());
    await screen.getByRole("button", { name: "Модули" }).click();

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "auto" });
  });

  it("lets the signed-in member log out from profile", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: testUser() });

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    const logoutButton = await screen.findByRole("button", { name: "Выйти" });
    await logoutButton.click();

    await waitFor(() => expect(logoutSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Вход в клуб" })).toBeTruthy();
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

  it("keeps mobile fullscreen layouts on the measured browser viewport without Telegram runtime", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).not.toContain("window.Telegram");
    expect(appSource).toContain("club-telegram-webview");
    expect(appSource).toContain("calculateLayoutCalibration");
    expect(appSource).toContain("--club-calibrated-top-offset");
    expect(appSource).toContain("--club-calibrated-chat-top-offset");
    expect(appSource).toContain("--club-calibrated-bottom-offset");
    expect(appSource).toContain("getViewportSizeClasses");
    expect(appSource).toContain("getDeviceLayoutClasses");
    expect(appSource).toContain("syncLayoutClasses");
    expect(appSource).toContain("--club-visible-viewport-height");
    expect(appSource).toContain("--club-visible-viewport-bottom");
    expect(styles).not.toContain("var(--tg-viewport-height, 100vh)");
    expect(styles).not.toContain("height: 100vh");
    expect(styles).not.toContain("calc(100vh");
    expect(styles).toContain("var(--club-calibrated-top-offset");
    expect(styles).toContain("var(--club-calibrated-chat-top-offset");
    expect(styles).toContain("var(--club-calibrated-bottom-offset");
    expect(styles).toContain("height: var(--club-viewport-height, 100dvh);");
    expect(styles).toContain("calc(var(--club-viewport-height, 100dvh) - var(--club-modal-top-offset))");
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).toContain(".club-telegram-webview:not(.club-telegram-fullscreen) .app-shell");
    expect(styles).toContain("body.club-keyboard-open .community-chat-open .chat-room");
    expect(styles).toContain("@media (max-width: 380px)");
    expect(styles).toContain(".payment-product-pay");
  });

  it("uses browser safe-area env fallback", () => {
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

  it("routes modal safe-area spacing through calibrated club variables", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const rawSafeAreaLines = styles
      .split(/\r?\n/)
      .flatMap((line, index) =>
        line.includes("env(safe-area-inset") && !line.trim().startsWith("--club-safe-")
          ? [`${index + 1}:${line.trim()}`]
          : []
      );

    expect(styles).toContain("--club-safe-top: var(--tg-safe-top, env(safe-area-inset-top));");
    expect(styles).toContain("--club-safe-bottom: var(--club-calibrated-bottom-offset");
    expect(styles).toContain("--club-modal-top-offset: max(0.6rem, var(--club-safe-top));");
    expect(styles).toContain("--club-modal-bottom-padding");
    expect(styles).toContain(".club-telegram-webview");
    expect(styles).toContain("--club-modal-top-offset: var(--fullscreen-top-offset);");
    expect(styles).toContain("padding-top: var(--club-modal-top-offset)");
    expect(styles).toContain("var(--club-modal-bottom-padding)");
    expect(styles).toContain("var(--club-safe-right)");
    expect(styles).toContain("var(--club-safe-left)");
    expect(rawSafeAreaLines).toEqual([]);
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
    expect(styles).toContain("padding-top: max(4.8rem, calc(var(--club-safe-top) + var(--space-page-top)));");
    expect(styles).toContain("gap: var(--space-section);");
    expect(styles).toContain("padding: var(--space-card);");
  });

  it("defines separate mobile bottom navigation and desktop sidebar surfaces", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("desktop-sidebar");
    expect(appSource).toContain("desktop-sidebar-nav");
    expect(appSource).toContain("mobile-bottom-nav");
    expect(appSource).toContain("desktop-sidebar-user");
    expect(appSource).toContain("visibleNavItems");
    expect(styles).toContain("@media (min-width: 1024px)");
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: flex;/);
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.mobile-bottom-nav\s*{[\s\S]*display: none;/);
    expect(styles).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: none;/);
  });

  it("uses a standalone responsive auth layout before login", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("'app-root-no-user': !session.user");
    expect(appSource).toContain("'app-layout-auth': !session.user");
    expect(appSource).toContain("'app-shell-auth': !session.user");
    expect(appSource).toContain("'content-panel-auth': !session.user");
    expect(styles).toContain(".app-root-no-user");
    expect(styles).toContain(".app-layout-auth");
    expect(styles).toContain(".app-shell-auth");
    expect(styles).toContain(".content-panel-auth");
    expect(styles).toMatch(/\.content-panel-auth\s*{[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
    expect(styles).toMatch(/\.content-panel-auth \.auth-panel\s*{[\s\S]*width: min\(100%, 28rem\);[\s\S]*margin: 0 auto;/);
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.app-layout-auth\s*{[\s\S]*display: block;/);
  });

  it("rescales auth and install surfaces when a touch browser exposes a desktop layout viewport", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("syncDesktopViewportMobileScale");
    expect(appSource).toContain("club-desktop-viewport-mobile");
    expect(appSource).toContain("--club-mobile-viewport-scale");
    expect(styles).toContain(".club-desktop-viewport-mobile .content-panel-auth .auth-panel");
    expect(styles).toContain(".club-desktop-viewport-mobile .pwa-install-card");
    expect(styles).toContain("transform: scale(var(--club-mobile-viewport-scale));");
    expect(styles).toContain("calc((100vw - 2rem) / var(--club-mobile-viewport-scale))");
  });

  it("keeps one compact side gutter across normal section tabs", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--screen-gutter: clamp(0.42rem, 1.7vw, 0.72rem);");
    expect(styles).toContain("--section-bleed: clamp(0.18rem, 0.7vw, 0.28rem);");
    expect(styles).toContain("body.club-screen-narrow");
    expect(styles).toContain("--screen-gutter: 0.42rem;");
    expect(styles).toContain("--section-bleed: 0.18rem;");
    expect(styles).toContain(".community-active .app-shell");
    expect(styles).toContain("padding: 1rem var(--screen-gutter) calc(1rem + var(--club-safe-bottom));");
    expect(styles).not.toContain("--screen-gutter: 0.9rem;");
  });

  it("uses a lower top offset for Samsung fullscreen webviews", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("body.club-samsung");
    expect(styles).toContain("--fullscreen-top-offset: var(--club-calibrated-top-offset, 4.8rem)");
  });

  it("keeps narrow Huawei webviews below Telegram top controls without extra air on normal tabs", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("body.club-huawei.club-screen-narrow");
    expect(styles).toContain("html.club-huawei.club-screen-narrow");
    expect(styles).toContain("font-size: 14px");
    expect(styles).toContain("body.club-huawei.club-screen-narrow .app-root:not(.community-chat-open)");
    expect(styles).toContain("--nav-space: calc(6.7rem + var(--club-calibrated-bottom-offset, var(--club-system-bottom, 0px)))");
    expect(styles).toContain(
      "--fullscreen-top-offset: var(--club-calibrated-top-offset, max(6.6rem, calc(var(--club-safe-top) + 3.8rem)))"
    );
    expect(styles).toContain(
      "--chat-top-offset: var(--club-calibrated-chat-top-offset, max(8rem, calc(var(--club-safe-top) + 5rem)))"
    );
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
    expect(styles).toMatch(/\.profile-subscription-meta\s*{[^}]*flex-wrap: nowrap;/s);
    expect(styles).toMatch(
      /\.profile-subscription-meta span:last-child\s*{[^}]*margin-left: auto;[^}]*white-space: nowrap;/s
    );
    expect(styles).toMatch(
      /body\.club-huawei\.club-screen-narrow \.profile-subscription-meta\s*{[^}]*display: flex;[^}]*justify-content: space-between;[^}]*flex-wrap: nowrap;/s
    );
    expect(styles).toMatch(
      /body\.club-huawei\.club-screen-narrow \.profile-subscription-meta span:first-child\s*{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/s
    );
    expect(styles).toMatch(/\.profile-card-head\s*{[^}]*display: flex;[^}]*justify-content: space-between;[^}]*flex-wrap: nowrap;/s);
    expect(styles).toMatch(/\.profile-card-head svg\s*{[^}]*flex: 0 0 auto;/s);
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
