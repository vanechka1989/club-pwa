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
const deviceLayoutSource = readFileSync(resolve(__dirname, "features/app/deviceLayout.ts"), "utf-8");
const profileSource = readFileSync(resolve(__dirname, "features/profile/ProfileSection.vue"), "utf-8");
const communitySource = readFileSync(resolve(__dirname, "features/community/CommunitySection.vue"), "utf-8");
const uiStoreSource = readFileSync(resolve(__dirname, "stores/ui.ts"), "utf-8");
const i18nSource = readFileSync(resolve(__dirname, "features/app/i18n.ts"), "utf-8");

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
    avatarPositionX: 50,
    avatarPositionY: 50,
    avatarScale: 1,
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
    browser: {
      displayMode: "standalone",
      standalone: true,
      safeAreaInset: null
    },
    classes: []
  };
}

function stubStandaloneDisplay(isStandalone = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(display-mode: standalone)" ? isStandalone : query === "(display-mode: browser)" ? !isStandalone : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
}

describe("App", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    stubStandaloneDisplay(true);
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

  it("uses one install surface before login", async () => {
    stubStandaloneDisplay(false);
    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(await screen.findByRole("heading", { name: "Установите Club на Windows" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Установить приложение" })).toBeTruthy());
    await new Promise((resolve) => window.setTimeout(resolve, 450));

    expect(screen.queryByRole("complementary", { name: "Установите Club как приложение" })).toBeNull();
  });

  it("restores the email code form without the generic login error after returning from mail", async () => {
    let rejectLoad!: (reason?: unknown) => void;
    vi.mocked(getMe).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectLoad = reject;
        })
    );
    localStorage.setItem(
      "club-pending-email-auth",
      JSON.stringify({
        email: "ivan@example.com",
        expiresAt: Date.now() + 10 * 60 * 1000
      })
    );

    render(App, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(await screen.findByRole("heading", { name: "Код из письма" })).toBeTruthy();
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    rejectLoad(new Error("unauthorized"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.queryByText("Войдите по email, чтобы открыть клуб.")).toBeNull();
    expect(screen.getByText("Введите 6 цифр из письма.")).toBeTruthy();
    expect(screen.queryByText("Код из письма. Введите 6 цифр из письма.")).toBeNull();
    expect(screen.queryByText(/Код отправлен на ivan@example.com/)).toBeNull();
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
    const confirmButton = await screen.findByRole("button", { name: "Да, выйти" });
    await confirmButton.click();

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

  it("does not expose legacy Telegram window/fullscreen mode controls", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(profileSource).not.toContain("profile-window-mode");
    expect(profileSource).not.toContain("fullscreenEnabled");
    expect(profileSource).not.toContain("setFullscreenEnabled");
    expect(uiStoreSource).not.toContain("club-fullscreen-enabled");
    expect(uiStoreSource).not.toContain("setFullscreenEnabled");
    expect(appSource).not.toContain("syncAppFullscreen");
    expect(appSource).not.toContain("club-telegram-fullscreen");
    expect(i18nSource).not.toContain("profileWindowMode");
    expect(styles).not.toContain(".profile-window-mode");
  });

  it("combines profile status and account identity into one card with avatar upload", () => {
    const apiSource = readFileSync(resolve(__dirname, "api/client.ts"), "utf-8");
    const sessionSource = readFileSync(resolve(__dirname, "stores/session.ts"), "utf-8");
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(profileSource).toContain("profile-access-card");
    expect(profileSource).toContain("profile-upload-input");
    expect(profileSource).toContain('type="file"');
    expect(profileSource).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(profileSource).toContain("handleAvatarUpload");
    expect(profileSource).not.toContain("profile-account-card");
    expect(profileSource).not.toContain("handleAvatarRefresh");
    expect(profileSource).not.toContain("avatarRefreshLocked");
    expect(apiSource).toContain("uploadAvatar");
    expect(apiSource).toContain("/me/avatar/upload");
    expect(sessionSource).toContain("uploadAvatar");
    expect(styles).toContain(".profile-access-card");
    expect(styles).toContain(".profile-avatar-upload");
  });

  it("keeps profile avatar controls compact and adds crop and logout confirmation flows", () => {
    const apiSource = readFileSync(resolve(__dirname, "api/client.ts"), "utf-8");
    const sessionSource = readFileSync(resolve(__dirname, "stores/session.ts"), "utf-8");
    const uiSource = readFileSync(resolve(__dirname, "stores/ui.ts"), "utf-8");
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(profileSource).toContain("profile-avatar-icon-button");
    expect(profileSource).toContain("profile-avatar-editor-modal");
    expect(profileSource).toContain("profile-avatar-gesture-stage");
    expect(profileSource).toContain("handleAvatarGestureStart");
    expect(profileSource).toContain("handleAvatarGestureMove");
    expect(profileSource).toContain("handleAvatarGestureEnd");
    expect(profileSource).toContain("openAvatarEditor({ useCurrentAvatar: true })");
    expect(profileSource).toContain("resetAvatarDraft");
    expect(profileSource).toContain("handleAvatarDisplaySave");
    expect(profileSource).toContain("showLogoutConfirm");
    expect(profileSource).toContain("profile-logout-confirm");
    expect(profileSource).toContain("visual-scale-control");
    expect(profileSource).toContain("visualScaleDisplayValue");
    expect(profileSource).toContain("handleVisualScaleRange");
    expect(profileSource).toContain('type="range"');
    expect(profileSource).toContain('min="1"');
    expect(profileSource).toContain('max="2"');
    expect(profileSource).toContain('step="0.1"');
    expect(profileSource).toContain("nudgeVisualScale");
    expect(profileSource).not.toContain("profile-range-row");
    expect(profileSource).not.toContain("visual-scale-choice");
    expect(profileSource).not.toContain("profile-avatar-nudge-grid");
    expect(profileSource).not.toContain("nudgeAvatar");
    expect(profileSource).not.toContain("avatarMessage || t(\"profileAvatarUploadHint\")");
    expect(apiSource).toContain("updateAvatarDisplay");
    expect(apiSource).toContain("/me/avatar/display");
    expect(sessionSource).toContain("updateAvatarDisplay");
    expect(uiSource).toContain("VisualScale");
    expect(uiSource).toContain("clampVisualScale");
    expect(uiSource).toContain("--club-user-font-root");
    expect(communitySource).toContain("avatarImageStyle");
    expect(communitySource).toContain("messageAuthorPhotoUrl");
    expect(communitySource).toContain("session.user?.photoUrl");
    expect(communitySource).toContain("message.author.photoUrl");
    expect(communitySource).toContain(":style=\"messageAuthorAvatarStyle(message)\"");
    expect(styles).toContain(".profile-avatar-editor-modal");
    expect(styles).toContain(".profile-avatar-gesture-stage");
    expect(styles).toContain("touch-action: none");
    expect(styles).toContain(".chat-avatar img");
    expect(styles).toContain("transform-origin");
    expect(styles).toContain(".visual-scale-control");
    expect(styles).toContain(".visual-scale-range");
    expect(styles).toContain(".visual-scale-step-button");
    expect(styles).toContain("var(--club-user-font-root");
  });

  it("keeps mobile payment plans readable with a right-aligned pay button", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /body\.club-mobile-device \.soft-payment-card\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*align-items: center;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.payment-product-actions\s*\{[\s\S]*justify-self: end;[\s\S]*width: auto;/
    );
    expect(styles).toMatch(/body\.club-mobile-device \.payment-product-pay\s*\{[\s\S]*width: clamp\(7\.2rem, 28vw, 8\.8rem\);/);
  });

  it("visually separates payment tariff cards", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const paymentsSource = readFileSync(resolve(__dirname, "features/billing/PaymentsSection.vue"), "utf-8");

    expect(paymentsSource).toContain("payment-product-list");
    expect(styles).toMatch(/\.payment-product-list\s*\{[\s\S]*display: grid;[\s\S]*gap: 0\.75rem;/);
    expect(styles).toMatch(/\.payment-product-list \.soft-payment-card\s*\{[\s\S]*box-shadow:/);
    expect(styles).toMatch(/\.payment-product-list \.soft-payment-card \+ \.soft-payment-card\s*\{[\s\S]*margin-top:/);
  });

  it("uses an in-app payment confirmation instead of the native browser confirm", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const paymentsSource = readFileSync(resolve(__dirname, "features/billing/PaymentsSection.vue"), "utf-8");

    expect(paymentsSource).not.toContain("resolve(window.confirm(paymentRedirectNotice))");
    expect(paymentsSource).toContain("showCheckoutConfirm");
    expect(paymentsSource).toContain("payment-confirm-card");
    expect(styles).toContain(".payment-confirm-card");
  });

  it("keeps the PWA shell free from legacy Telegram webview runtime classes", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).not.toContain("window.Telegram");
    expect(appSource).not.toContain("club-telegram-webview");
    expect(appSource).not.toContain("club-telegram-fullscreen");
    expect(appSource).toContain("calculateLayoutCalibration");
    expect(appSource).toContain("--club-calibrated-bottom-offset");
    expect(appSource).toContain("createDeviceLayoutSnapshot");
    expect(appSource).toContain("syncLayoutClasses");
    expect(appSource).toContain("--club-visible-viewport-height");
    expect(appSource).toContain("--club-visible-viewport-bottom");
    expect(styles).not.toContain("var(--tg-viewport-height, 100vh)");
    expect(styles).not.toContain("height: 100vh");
    expect(styles).not.toContain("calc(100vh");
    expect(styles).toContain("var(--club-calibrated-bottom-offset");
    expect(styles).toContain("height: var(--club-viewport-height, 100dvh);");
    expect(styles).toContain("calc(var(--club-viewport-height, 100dvh) - var(--club-modal-top-offset))");
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).not.toContain("club-telegram-webview");
    expect(styles).not.toContain("club-telegram-fullscreen");
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
          .filter((side) => line.includes(`env(safe-area-inset-${side})`) && !line.trim().startsWith(`--club-safe-${side}`))
          .map((side) => `${index + 1}:${side}:${line.trim()}`)
      );

    expect(appIndexSource).toContain("viewport-fit=cover");
    expect(unsafeSafeAreaLines).toEqual([]);
    expect(styles).not.toContain("--tg-safe");
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

    expect(styles).toContain("--club-safe-top: env(safe-area-inset-top);");
    expect(styles).toContain("--club-safe-bottom: max(var(--club-calibrated-bottom-offset");
    expect(styles).toContain("--club-modal-top-offset: max(0.6rem, var(--club-safe-top));");
    expect(styles).toContain("--club-modal-bottom-padding");
    expect(styles).toContain("--support-modal-top-clearance: var(--club-modal-top-padding)");
    expect(styles).toContain("var(--club-modal-bottom-padding)");
    expect(styles).toContain("var(--club-safe-right)");
    expect(styles).toContain("var(--club-safe-left)");
    expect(rawSafeAreaLines).toEqual([]);
  });

  it("uses adaptive typography and spacing tokens for the app shell", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--font-root: var(--club-user-font-root, clamp(");
    expect(styles).toContain("--font-base: var(--club-user-font-base, clamp(");
    expect(styles).toContain("--font-title: clamp(");
    expect(styles).toContain("--space-section: clamp(");
    expect(styles).toContain("--space-card: clamp(");
    expect(styles).toContain("font-size: var(--font-root);");
    expect(styles).toContain("font-size: var(--font-base);");
    expect(styles).toContain("padding: var(--space-section) var(--screen-gutter);");
    expect(styles).toContain("gap: var(--space-section);");
    expect(styles).toContain("padding: var(--space-card);");
  });

  it("starts from light theme variables before the UI store hydrates", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const rootBlock = styles.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";

    expect(rootBlock).toContain("color-scheme: light;");
    expect(rootBlock).toContain("--bg: #f4f6fb;");
    expect(rootBlock).not.toContain("--bg: #050509;");
  });

  it("defines separate mobile bottom navigation and desktop sidebar surfaces", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("desktop-sidebar");
    expect(appSource).toContain("desktop-sidebar-nav");
    expect(appSource).toContain("mobile-bottom-nav");
    expect(appSource).toContain("desktop-sidebar-user");
    expect(appSource).toContain("visibleNavItems");
    expect(appSource).toContain("visibleMobileNavItems");
    expect(styles).toContain("@media (min-width: 1024px)");
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: flex;/);
    expect(styles).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.mobile-bottom-nav\s*{[\s\S]*display: none;/);
    expect(styles).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.desktop-sidebar\s*{[\s\S]*display: none;/);
  });

  it("keeps admin inside the mobile bottom tab bar for admins", () => {
    const navigationSource = readFileSync(resolve(__dirname, "features/app/navigation.ts"), "utf-8");
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("mobileNavItems");
    expect(appSource).toContain("visibleMobileNavItems");
    expect(appSource).not.toContain('item.id !== "admin"');
    expect(appSource).not.toContain("mobile-admin-entry");
    expect(navigationSource).toContain('"support", "admin"');
    expect(appSource).toContain("bottom-nav-admin");
    expect(styles).toContain(".bottom-nav-admin");
  });

  it("removes the collapsible mobile nav control from the PWA shell", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).not.toContain("navCollapsed");
    expect(appSource).not.toContain("toggleNavCollapsed");
    expect(appSource).not.toContain("bottom-nav-toggle");
    expect(styles).not.toContain(".bottom-nav-toggle");
    expect(styles).not.toContain(".bottom-nav-collapsed");
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

  it("keeps the pre-login auth form readable on narrow phones without relying on JS device classes", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.app-shell-auth\s*{[\s\S]*align-items: stretch;/);
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.content-panel-auth \.auth-panel\s*{[\s\S]*width: 100%;[\s\S]*max-width: none;/);
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*\.auth-panel h2\s*{[\s\S]*font-size: 1.35rem;/);
  });

  it("keeps installed mobile PWA auth full-width even when Android reports a wide layout viewport", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(/body\.club-mobile-device \.app-shell-auth\s*{[\s\S]*align-items: stretch;/);
    expect(styles).toMatch(/body\.club-mobile-device \.content-panel-auth\s*{[\s\S]*justify-items: stretch;/);
    expect(styles).toMatch(
      /body\.club-mobile-device \.content-panel-auth \.auth-panel,\s*body\.club-mobile-device \.content-panel-auth \.auth-install-required\s*{[\s\S]*width: 100%;[\s\S]*max-width: none;/
    );
  });

  it("scales only the pre-login auth surface when a mobile PWA reports a desktop-width viewport", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(deviceLayoutSource).toContain("club-mobile-auth-scaled");
    expect(deviceLayoutSource).toContain("--club-auth-wide-viewport-scale");
    expect(styles).toMatch(/html\.club-mobile-auth-scaled,\s*body\.club-mobile-auth-scaled\s*{[\s\S]*overflow: hidden;[\s\S]*overscroll-behavior: none;/);
    expect(styles).toMatch(
      /body\.club-mobile-auth-scaled \.app-root-no-user,\s*body\.club-mobile-auth-scaled \.app-layout-auth,\s*body\.club-mobile-auth-scaled \.app-shell-auth\s*{[\s\S]*height: var\(--app-viewport-height\);[\s\S]*max-height: var\(--app-viewport-height\);[\s\S]*overflow: hidden;/
    );
    expect(styles).toContain("--club-auth-wide-viewport-shift");
    expect(styles).toMatch(
      /body\.club-mobile-auth-scaled \.content-panel-auth \.auth-panel,\s*body\.club-mobile-auth-scaled \.content-panel-auth \.auth-install-required\s*{[\s\S]*width: calc\(100% \/ var\(--club-auth-wide-viewport-scale, 1\)\);[\s\S]*transform: translateY\(calc\(-1 \* var\(--club-auth-wide-viewport-shift, 1\.15rem\)\)\) scale\(var\(--club-auth-wide-viewport-scale, 1\)\);/
    );
  });

  it("uses a separate scaled typography shell after login on wide mobile PWA viewports", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(deviceLayoutSource).toContain("club-mobile-app-scaled");
    expect(deviceLayoutSource).toContain("--club-app-wide-viewport-scale");
    expect(deviceLayoutSource).toContain("--club-app-wide-font-root");
    expect(deviceLayoutSource).toContain("--club-app-wide-font-base");
    expect(appSource).toContain('session.user ? "signed-in" : "signed-out"');
    expect(styles).toMatch(
      /html\.club-mobile-app-scaled\s*{[\s\S]*font-size: var\(--club-user-font-root, var\(--club-app-wide-font-root, 16px\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled\s*{[\s\S]*overflow-x: hidden;[\s\S]*font-size: var\(--club-user-font-base, var\(--club-app-wide-font-base, 16px\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.admin-modal-backdrop,\s*body\.club-mobile-app-scaled \.support-modal-backdrop,\s*body\.club-mobile-app-scaled \.payment-modal-backdrop\s*{[\s\S]*font-size: var\(--club-user-font-base, var\(--club-app-wide-font-base, 16px\)\);/
    );
  });

  it("uses a PWA-first mobile device shell instead of zooming a desktop viewport", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("syncMobileDeviceShell");
    expect(deviceLayoutSource).toContain("club-mobile-device");
    expect(appSource).toContain("isMobileDeviceShell");
    expect(appSource).toContain("showDesktopNavigation");
    expect(appSource).toContain("showMobileNavigation");
    expect(appSource).not.toContain("--club-mobile-device-scale");
    expect(styles).toContain("html.club-mobile-device");
    expect(styles).not.toContain("--club-mobile-device-scale");
    expect(styles).not.toContain("font-size: calc(16px * var(--club-mobile-device-scale, 1));");
    expect(styles).toContain("body.club-mobile-device .app-root:not(.app-root-no-user) .app-shell");
    expect(styles).toContain("body.club-mobile-device .desktop-sidebar");
    expect(styles).toContain("body.club-mobile-device .mobile-bottom-nav");
    expect(styles).not.toContain("club-desktop-viewport-mobile");
    expect(styles).not.toContain("zoom: var(--club-mobile-viewport-scale);");
    expect(styles).not.toContain("calc((100vw - 2rem) / var(--club-mobile-viewport-scale))");
  });

  it("prevents signed-in mobile PWA content from stretching under page gestures", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /body\.club-mobile-device \.app-root:not\(\.app-root-no-user\)\s*\{[\s\S]*max-width: 100vw;[\s\S]*overflow-x: hidden;[\s\S]*touch-action: pan-y;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.app-root:not\(\.app-root-no-user\) \.app-layout,\s*body\.club-mobile-device \.app-root:not\(\.app-root-no-user\) \.app-shell,\s*body\.club-mobile-device \.app-root:not\(\.app-root-no-user\) \.content-panel,\s*body\.club-mobile-device \.app-root:not\(\.app-root-no-user\) \.section-host\s*\{[\s\S]*max-width: 100vw;[\s\S]*overflow-x: clip;/
    );
    expect(styles).toMatch(/\.profile-avatar-gesture-stage\s*\{[\s\S]*touch-action: none;/);
  });

  it("routes PWA platform and scale decisions through one device layout adapter", () => {
    expect(appSource).toContain("createDeviceLayoutSnapshot");
    expect(appSource).toContain("snapshot.cssVariables");
    expect(appSource).toContain("snapshot.removedCssVariables");
    expect(appSource).not.toContain("function syncWideViewportAppScale");
    expect(appSource).not.toContain("function formatScaledCssPx");
    expect(appSource).not.toContain("getMobileDeviceShellScale");
  });

  it("keeps email resend disabled with a visible timer during cooldown", () => {
    const authSource = readFileSync(resolve(__dirname, "features/auth/AuthSection.vue"), "utf-8");

    expect(authSource).toContain(':disabled="!canResendCode"');
    expect(authSource).toContain("resendRemainingSeconds.value > 0");
    expect(authSource).toContain("Отправить код ещё раз через");
    expect(authSource).not.toContain("Код отправлен на");
  });

  it("uses readable mobile app typography for signed-in content", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("body.club-mobile-device .soft-home");
    expect(styles).toContain("body.club-mobile-device .section-title");
    expect(styles).toContain("body.club-mobile-device .profile-info-row span");
    expect(styles).toContain("body.club-mobile-device .soft-inline-button");
    expect(styles).toContain("body.club-mobile-device .theme-choice");
    expect(styles).toContain("body.club-mobile-device .app-root:not(.app-root-no-user) .section-host");
    expect(styles).toContain("body.club-mobile-device .learning-hero-card");
    expect(styles).toContain("body.club-mobile-device .soft-payment-card");
    expect(styles).toContain("body.club-mobile-device .support-topic-option");
    expect(styles).toContain("body.club-mobile-device .bottom-nav");
  });

  it("uses compact polished density for wide mobile PWA app surfaces", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--club-mobile-card-radius: 24px;");
    expect(styles).toContain("--club-mobile-sheet-radius: 28px;");
    expect(styles).toMatch(
      /body\.club-mobile-device \.section-head,\s*body\.club-mobile-device \.soft-card,\s*body\.club-mobile-device \.soft-list-card\s*\{[\s\S]*border-radius: var\(--club-mobile-card-radius\);/
    );
    expect(styles).toMatch(/body\.club-mobile-app-scaled\s*\{[\s\S]*--space-section: clamp\(0\.46rem, 1\.2vw, 0\.68rem\);[\s\S]*--ui-button-height: 2\.32rem;/);
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.section-head,\s*body\.club-mobile-app-scaled \.soft-card,\s*body\.club-mobile-app-scaled \.soft-list-card\s*\{[\s\S]*border-radius: var\(--club-mobile-card-radius\);[\s\S]*padding: 0\.74rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.bottom-nav\s*\{[\s\S]*border-radius: 24px;[\s\S]*padding: 0\.26rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.admin-client-modal,\s*body\.club-mobile-app-scaled \.payment-form-modal,\s*body\.club-mobile-app-scaled \.support-ticket-modal,\s*body\.club-mobile-app-scaled \.lesson-preview-modal,\s*body\.club-mobile-app-scaled \.module-name-modal\s*\{[\s\S]*border-radius: var\(--club-mobile-sheet-radius\) var\(--club-mobile-sheet-radius\) 0 0;/
    );
  });

  it("keeps mobile admin and support pages compact and scroll-safe", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-tabs\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*overflow: visible;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-tab\s*\{[\s\S]*min-width: 0;[\s\S]*min-height: 2\.86rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-stat-kpis\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 0\.42rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-stat-block\s*\{[\s\S]*padding: 0\.62rem;[\s\S]*border-radius: 20px;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-filter-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.support-admin-stats\s*\{[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.support-admin-ticket\s*\{[\s\S]*padding: 0\.58rem;[\s\S]*border-radius: 18px;/
    );
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

  it("does not keep vendor-specific Telegram fullscreen offsets in the PWA shell", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).not.toContain("--fullscreen-top-offset");
    expect(styles).not.toContain("--chat-top-offset");
    expect(styles).not.toContain("body.club-samsung");
    expect(styles).not.toContain("body.club-huawei");
    expect(styles).not.toContain("body.club-android-compact-top");
  });

  it("keeps narrow Android PWA layouts readable without Huawei webview shrink rules", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain(".sr-only");
    expect(styles).toContain("position: absolute");
    expect(styles).not.toMatch(/body\.club-huawei\.club-screen-narrow\s+\.(soft-card|profile-info-row|bottom-nav|chat-bubble)/);
    expect(styles).not.toMatch(/html\.club-huawei\.club-screen-narrow[^.{]*\s*{[^}]*font-size:\s*14px/s);
    expect(styles).toContain("body.club-screen-narrow");
    expect(styles).toContain("--screen-gutter: 0.42rem;");
    expect(styles).toMatch(/\.profile-subscription-meta\s*{[^}]*flex-wrap: nowrap;/s);
    expect(styles).toMatch(
      /\.profile-subscription-meta span:last-child\s*{[^}]*margin-left: auto;[^}]*white-space: nowrap;/s
    );
    expect(styles).toMatch(/\.profile-card-head\s*{[^}]*display: flex;[^}]*justify-content: space-between;[^}]*flex-wrap: nowrap;/s);
    expect(styles).toMatch(/\.profile-card-head svg\s*{[^}]*flex: 0 0 auto;/s);
  });

  it("keeps the mobile chat composer visible above the keyboard", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("showBottomNavigation");
    expect(appSource).toContain("!communityChatOpen");
    expect(appSource).toContain('v-if="showBottomNavigation"');
    expect(styles).toMatch(
      /\.community-chat-open \.chat-room\s*\{[\s\S]*padding: 0\.7rem 0\.42rem calc\(0\.25rem \+ var\(--club-safe-bottom\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.community-chat-open \.chat-compose\s*\{[\s\S]*position: fixed;[\s\S]*right: max\(0\.2rem, calc\(var\(--club-safe-right\) \+ 0\.2rem\)\);[\s\S]*bottom: max\(0\.28rem, var\(--club-safe-bottom\)\);[\s\S]*left: max\(0\.2rem, calc\(var\(--club-safe-left\) \+ 0\.2rem\)\);[\s\S]*width: auto;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.community-chat-open \.chat-messages\s*\{[\s\S]*padding-bottom: 4\.8rem;/
    );
    expect(styles).toMatch(
      /body\.club-keyboard-open \.community-chat-open \.chat-compose\s*\{[\s\S]*position: fixed;[\s\S]*bottom: max\(0\.28rem, var\(--club-safe-bottom\)\);/
    );
    expect(styles).toMatch(
      /\.community-chat-open \.chat-compose\s*\{[\s\S]*border-radius: 18px;[\s\S]*padding: 0\.22rem;/
    );
    expect(styles).toMatch(
      /\.community-chat-open \.chat-input-row \.icon-button\s*\{[\s\S]*height: 2\.55rem;[\s\S]*min-width: 2\.55rem;/
    );
    expect(styles).toMatch(
      /\.community-chat-open \.chat-input-row \.text-input\s*\{[\s\S]*flex: 1 1 auto;[\s\S]*min-width: 0;/
    );
  });

  it("does not shrink standalone Android PWA typography to legacy webview scale", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).not.toContain("html.club-huawei.club-screen-narrow");
    expect(styles).not.toMatch(/club-screen-narrow[^}]*font-size:\s*14px/s);
  });

  it("styles fullscreen video close control as a themed pill in portrait and landscape", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /\.lesson-video-exit-fullscreen-button\s*{[^}]*border-radius:\s*999px;[^}]*background:\s*color-mix\(in srgb, var\(--panel-strong\)/s
    );
    expect(styles).toMatch(/\.lesson-video-exit-fullscreen-button span\s*{[^}]*font-size:/s);
    expect(styles).toMatch(/@media \(orientation: landscape\)\s*{[^}]*\.lesson-video-exit-fullscreen-button/s);
  });

  it("keeps lesson media fullscreen inside the app instead of browser fullscreen", () => {
    const learningSource = readFileSync(resolve(__dirname, "features/learning/LearningSection.vue"), "utf-8");

    expect(learningSource).not.toContain("requestFullscreen");
    expect(learningSource).not.toContain("document.exitFullscreen");
    expect(learningSource).not.toContain("document.fullscreenElement");
    expect(learningSource).not.toContain("fullscreenchange");
  });
});
