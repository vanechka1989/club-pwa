import type { ClubUser } from "@club/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { router } from "./router";
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
  requestEmailCode,
  verifyEmailCode,
  updateDeviceDiagnostics
} from "@/api/client";
import App from "./App.vue";

const appSource = readFileSync(resolve(__dirname, "App.vue"), "utf-8");
const appIndexSource = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
const deviceLayoutSource = readFileSync(resolve(__dirname, "features/app/deviceLayout.ts"), "utf-8");
const deviceModeNoticeSource = readFileSync(resolve(__dirname, "features/app/DeviceModeNotice.vue"), "utf-8");
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
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
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
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, devCode: null });
    vi.mocked(verifyEmailCode).mockResolvedValue({ ok: true });
    vi.mocked(updateDeviceDiagnostics).mockResolvedValue({ ok: true, device: testDeviceDiagnostics() });
  });

  it("renders email login when no session is present", async () => {
    render(App, {
      global: {
        plugins: [createPinia(), router]
      }
    });

    expect(await screen.findByRole("heading", { name: "Вход в клуб" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Получить код" })).toBeTruthy();
  });

  it("uses one install surface before login", async () => {
    stubStandaloneDisplay(false);
    render(App, {
      global: {
        plugins: [createPinia(), router]
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
        plugins: [createPinia(), router]
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

  it("keeps the code form mounted and shows the server error after an invalid code", async () => {
    let rejectVerification!: (reason?: unknown) => void;
    localStorage.setItem(
      "club-pending-email-auth",
      JSON.stringify({
        email: "ivan@example.com",
        expiresAt: Date.now() + 10 * 60 * 1000
      })
    );
    vi.mocked(verifyEmailCode).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectVerification = reject;
        })
    );

    render(App, {
      global: {
        plugins: [createPinia(), router]
      }
    });

    await fireEvent.update(await screen.findByLabelText("Код"), "111111");
    await fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect((screen.getByLabelText("Код") as HTMLInputElement).value).toBe("111111");

    rejectVerification({
      data: {
        code: "AUTH_INVALID_CODE",
        error: "Неверный код. Проверьте цифры и попробуйте ещё раз. Осталось попыток: 4.",
        attemptsRemaining: 4
      },
      status: 400
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Неверный код. Проверьте цифры и попробуйте ещё раз. Осталось попыток: 4."
    );
    expect((screen.getByLabelText("Код") as HTMLInputElement).value).toBe("111111");
  });

  it("resets window scroll when changing sections", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.mocked(getMe).mockResolvedValue({ user: testUser() });

    render(App, {
      global: {
        plugins: [createPinia(), router]
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
        plugins: [createPinia(), router]
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
    expect(appSource).toContain('void router.replace(sectionPath("profile"))');
  });

  it("drives sections and task navigation from the URL", () => {
    expect(appSource).toContain("const route = useRoute()");
    expect(appSource).toContain("const router = useRouter()");
    expect(appSource).toContain("const activeSection = computed<AppSection>(() => sectionFromPath(route.path))");
    expect(appSource).toContain("void router.push(sectionPath(section))");
    expect(appSource).toContain("!isTaskPath(route.path)");
  });

  it("shows a red mail marker on profile nav when app notifications are unread", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("startAppStatePolling");
    expect(appSource).toContain("notifications.setUnreadCount(response.notificationUnreadCount)");
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
    expect(profileSource).toContain('min="0.8"');
    expect(profileSource).toContain('max="1.4"');
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

  it("keeps mobile payment plans compact with inline actions", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const responsiveLayer = styles.slice(styles.lastIndexOf("Responsive modal and mobile commerce system"));

    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.payment-product-list\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s);
    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.payment-product-list \.soft-payment-card\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;/s);
    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.payment-product-actions\s*\{[^}]*width: auto;[^}]*justify-self: end;/s);
    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.payment-product-pay\s*\{[^}]*width: 80px;/s);
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
    expect(paymentsSource).toContain("<ConfirmDialog");
    expect(styles).toContain(".confirm-dialog");
  });

  it("keeps the PWA shell free from legacy Telegram webview runtime classes", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const communityStyles = readFileSync(resolve(__dirname, "features/community/community.css"), "utf-8");

    expect(appSource).not.toContain("window.Telegram");
    expect(appSource).not.toContain("club-telegram-webview");
    expect(appSource).not.toContain("club-telegram-fullscreen");
    expect(appSource).toContain("calculateLayoutCalibration");
    expect(appSource).toContain("--club-calibrated-bottom-offset");
    expect(appSource).toContain("createDeviceLayoutSnapshot");
    expect(appSource).toContain("syncLayoutClasses");
    expect(appSource).toContain("--club-visible-viewport-height");
    expect(appSource).toContain("--club-visible-viewport-bottom");
    expect(appSource).toContain("createViewportSyncScheduler");
    expect(appSource).toContain("stabilizeViewportMetric");
    expect(appSource).toContain("keyboardWasOpen ? 56 : 96");
    expect(appSource).toContain('addEventListener("orientationchange", scheduleViewportHeightSync)');
    expect(styles).not.toContain("var(--tg-viewport-height, 100vh)");
    expect(styles).not.toContain("height: 100vh");
    expect(styles).not.toContain("calc(100vh");
    expect(styles).toContain("var(--club-calibrated-bottom-offset");
    expect(styles).toContain("height: var(--club-viewport-height, 100dvh);");
    expect(styles).toContain("calc(var(--club-viewport-height, 100dvh) - var(--club-modal-top-offset))");
    expect(styles).toContain("@media (pointer: coarse)");
    expect(styles).not.toContain("club-telegram-webview");
    expect(styles).not.toContain("club-telegram-fullscreen");
    expect(communityStyles).toContain("body.club-keyboard-open .app-root.community-chat-open");
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

  it("keeps chat and support typography aligned with the profile standard", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--content-font-body: 14px;");
    expect(styles).toContain("--content-font-label: 13px;");
    expect(styles).toContain("--content-font-meta: 12px;");
    expect(styles).toContain("--content-font-input: 16px;");
    expect(styles).toMatch(/input,\s*select,\s*textarea\s*{[^}]*font-family:\s*inherit;/s);
    expect(styles).toMatch(
      /\.chat-message-body,\s*\.support-message p\s*{[^}]*font-size:\s*var\(--content-font-body\);[^}]*line-height:\s*1\.45;/s
    );
    expect(styles).toMatch(
      /\.chat-message-author,\s*\.support-message strong,\s*\.support-ticket-title\s*{[^}]*font-size:\s*var\(--content-font-label\);/s
    );
    expect(styles).toMatch(
      /\.chat-message-head,\s*\.support-message small\s*{[^}]*font-size:\s*var\(--content-font-meta\);/s
    );
    expect(styles).toMatch(
      /\.community-chat-open \.chat-input-row \.text-input,\s*\.support-task-screen \.support-field input,\s*\.support-task-screen \.support-field select,\s*\.support-task-screen \.support-field textarea,\s*\.support-task-screen \.support-reply-form textarea\s*{[^}]*font-family:\s*inherit;[^}]*font-size:\s*var\(--content-font-input\);/s
    );
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

  it("keeps the desktop sidebar identity aligned with the profile", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("session.user?.displayName || session.user?.firstName || session.user?.username");
    expect(appSource).toContain('class="desktop-sidebar-avatar-image"');
    expect(appSource).toContain(':style="userAvatarStyle"');
    expect(appSource).not.toContain('<span>{{ t("headline") }}</span>');
    expect(styles).toContain(".desktop-sidebar-avatar-image");
    expect(styles).toContain("object-fit: cover;");
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
      /html\.club-mobile-app-scaled\s*{[\s\S]*font-size: calc\(var\(--club-app-wide-font-root, 16px\) \* var\(--club-user-visual-scale, 1\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled\s*{[\s\S]*overflow-x: hidden;[\s\S]*font-size: calc\(var\(--club-app-wide-font-base, 16px\) \* var\(--club-user-visual-scale, 1\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.admin-modal-backdrop,\s*body\.club-mobile-app-scaled \.support-modal-backdrop,\s*body\.club-mobile-app-scaled \.payment-modal-backdrop\s*{[\s\S]*font-size: calc\(var\(--club-app-wide-font-base, 16px\) \* var\(--club-user-visual-scale, 1\)\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-client-modal,\s*body\.club-mobile-device \.payment-form-modal,\s*body\.club-mobile-device \.support-ticket-modal,\s*body\.club-mobile-device \.lesson-preview-modal,\s*body\.club-mobile-device \.module-name-modal,[\s\S]*width: min\(100%, 36rem\);[\s\S]*border-radius: 30px;/
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

  it("classifies device mode and keeps every confident device inside the mobile presentation", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("classifyDeviceMode");
    expect(appSource).toContain("shouldForceMobilePresentation");
    expect(appSource).toContain("getDeviceModeNoticeKind");
    expect(appSource).toContain("getSafeQrTarget");
    expect(appSource).toContain("DeviceModeNotice");
    expect(appSource).toContain("desktop-mobile-preview");
    expect(appSource).toContain("sessionStorage");
    expect(appSource).toContain("forceMobileShell");
    expect(deviceModeNoticeSource).toContain('role="dialog"');
    expect(styles).toMatch(/\.app-root\.desktop-mobile-preview\s*{[\s\S]*max-width:\s*30rem;/);
    expect(styles).toMatch(/\.desktop-mobile-preview \.bottom-nav\s*{[\s\S]*left:\s*50%;[\s\S]*translateX\(-50%\)/);
  });

  it("prevents signed-in mobile PWA content from stretching under page gestures", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(appSource).toContain("preventModalPagePinch");
    expect(appSource).toContain("event.touches.length < 2");
    expect(appSource).toContain(".profile-avatar-gesture-stage");
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

  it("keeps day and night separate from five design themes", () => {
    const profileSource = readFileSync(resolve(__dirname, "features/profile/ProfileSection.vue"), "utf-8");
    const i18nSource = readFileSync(resolve(__dirname, "features/app/i18n.ts"), "utf-8");
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(profileSource).toContain("themeOptions");
    expect(profileSource).toContain("designThemeOptions");
    expect(profileSource).toContain("ui.designTheme === option.value");
    expect(profileSource).toContain("ui.setDesignTheme(option.value)");
    expect(profileSource).toContain("design-theme-choice-grid");
    expect(profileSource).toContain("design-theme-choice-active");
    for (const value of ["pine-teal", "warm-clay", "plum-rose"]) {
      expect(profileSource).toContain(`value: "${value}"`);
    }
    for (const key of [
      "profileDesignThemePine",
      "profileDesignThemePineText",
      "profileDesignThemeClay",
      "profileDesignThemeClayText",
      "profileDesignThemePlum",
      "profileDesignThemePlumText"
    ]) {
      expect(i18nSource).toContain(`${key}:`);
    }
    for (const previewClass of [
      "design-theme-preview-pine",
      "design-theme-preview-clay",
      "design-theme-preview-plum"
    ]) {
      expect(styles).toContain(`.${previewClass}`);
    }
    expect(profileSource).not.toContain("colorOptions");
    expect(profileSource).not.toContain("scheme-grid");
    expect(profileSource).not.toContain("scheme-choice");
    expect(profileSource).not.toContain("ui.setColorScheme");
  });

  it("keeps appearance rows aligned and prevents touch slider drags", () => {
    const profileSource = readFileSync(resolve(__dirname, "features/profile/ProfileSection.vue"), "utf-8");
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(profileSource).toContain('class="design-theme-choice"');
    expect(profileSource).not.toContain('class="design-theme-choice ui-button"');
    expect(styles).toMatch(
      /\.design-theme-choice\s*\{[\s\S]*grid-template-columns:\s*2\.55rem minmax\(0, 1fr\) 1\.7rem;/
    );
    expect(styles).toMatch(
      /@media \(hover: none\) and \(pointer: coarse\)[\s\S]*\.visual-scale-range\s*\{[\s\S]*pointer-events:\s*none;/
    );
  });

  it("defines a real light soft-touch token set for day mode", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(/:root\[data-theme="light"\]\s*{[\s\S]*color-scheme: light;[\s\S]*--bg: #eef5fc;/);
    expect(styles).toMatch(/:root\[data-theme="light"\]\s*{[\s\S]*--surface: #f8fbff;[\s\S]*--text: #0e1828;/);
    expect(styles).toMatch(/:root\[data-theme="light"\]\s*{[\s\S]*--floating-bg: rgba\(248, 251, 255, 0\.82\);/);
    expect(styles).not.toMatch(/:root,\s*:root\[data-theme="dark"\],\s*:root\[data-theme="light"\]\s*{[\s\S]*color-scheme: dark;/);
  });

  it("uses separate compact, form, and workspace mobile modal sizes", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const finalMobileGuard = styles.slice(styles.lastIndexOf("Final mobile modal guard"));

    expect(finalMobileGuard).toContain("--club-mobile-modal-width: calc(100vw - (var(--club-mobile-modal-inline-gutter) * 2));");
    expect(finalMobileGuard).toContain("--club-mobile-modal-height: calc(");
    expect(finalMobileGuard).toContain("Modal sizing: workspace dialogs");
    expect(finalMobileGuard).toContain("Modal sizing: form dialogs");
    expect(finalMobileGuard).toContain("Modal sizing: compact dialogs");
    expect(finalMobileGuard).toMatch(/Modal sizing: workspace dialogs[\s\S]*\.admin-client-modal[\s\S]*height: var\(--club-mobile-modal-height\);/);
    expect(finalMobileGuard).toMatch(/Modal sizing: form dialogs[\s\S]*\.admin-mailing-composer-modal[\s\S]*height: var\(--club-mobile-modal-height\);/);
    expect(finalMobileGuard).toMatch(/Modal sizing: compact dialogs[\s\S]*\.module-name-modal[\s\S]*height: auto;[\s\S]*max-height: min\(38rem, var\(--club-mobile-modal-height\)\);/);
    expect(finalMobileGuard).toMatch(
      /body\.club-mobile-device\.club-keyboard-open\s*\{[\s\S]*--club-modal-bottom-offset: 0px;[\s\S]*--club-mobile-modal-height: calc\(/
    );
    expect(finalMobileGuard).toMatch(
      /body\.club-mobile-device \.admin-mailing-builder-footer\s*\{[\s\S]*padding:[^;]*var\(--club-modal-bottom-offset\)/
    );
  });

  it("uses compact polished density for wide mobile PWA app surfaces", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toContain("--club-mobile-card-radius: 24px;");
    expect(styles).toContain("--club-mobile-sheet-radius: 28px;");
    expect(styles).toMatch(
      /body\.club-mobile-device \.section-head,\s*body\.club-mobile-device \.soft-card,\s*body\.club-mobile-device \.soft-list-card\s*\{[\s\S]*border-radius: var\(--club-mobile-card-radius\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled\s*\{[\s\S]*--space-section: calc\(16px \* var\(--club-app-wide-viewport-scale, 1\)\);[\s\S]*--ui-button-height: var\(--button-height\);/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.section-head,\s*body\.club-mobile-app-scaled \.soft-card,\s*body\.club-mobile-app-scaled \.soft-list-card\s*\{[\s\S]*border-radius: var\(--club-mobile-card-radius\);[\s\S]*padding: 0\.74rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.bottom-nav\s*\{[\s\S]*border-radius: 24px;[\s\S]*padding: 0\.26rem;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.admin-modal-backdrop,\s*body\.club-mobile-app-scaled \.payment-modal-backdrop,\s*body\.club-mobile-app-scaled \.support-modal-backdrop\s*\{[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*justify-items: center;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-app-scaled \.admin-client-modal,\s*body\.club-mobile-app-scaled \.payment-form-modal,\s*body\.club-mobile-app-scaled \.support-ticket-modal,\s*body\.club-mobile-app-scaled \.lesson-preview-modal,\s*body\.club-mobile-app-scaled \.module-name-modal\s*\{[\s\S]*width: min\(100%, 36rem\);[\s\S]*border-radius: 30px;/
    );
  });

  it("keeps mobile dialogs bounded after generic tablet breakpoint rules", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const genericFullscreenRule = Math.max(
      styles.lastIndexOf(".admin-modal-backdrop {\r\n    align-items: stretch;"),
      styles.lastIndexOf(".admin-modal-backdrop {\n    align-items: stretch;")
    );
    const lateSoftTouchLayer = styles.lastIndexOf("Matte Soft Touch redesign");
    const lateNotificationWidth = styles.lastIndexOf(".notification-center-panel {\n  width: min(30rem, 100%);");
    const mobileGuardRule = styles.lastIndexOf("Final mobile modal guard");

    expect(mobileGuardRule).toBeGreaterThan(genericFullscreenRule);
    expect(mobileGuardRule).toBeGreaterThan(lateSoftTouchLayer);
    expect(mobileGuardRule).toBeGreaterThan(lateNotificationWidth);
    const mobileGuard = styles.slice(mobileGuardRule);

    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.admin-modal-backdrop,\s*body\.club-mobile-device \.payment-modal-backdrop,\s*body\.club-mobile-device \.support-modal-backdrop,\s*body\.club-mobile-device \.profile-modal-backdrop,\s*body\.club-mobile-device \.notification-center-backdrop,\s*body\.club-mobile-device \.support-confirm-backdrop,\s*body\.club-mobile-device \.payment-confirm-backdrop,\s*body\.club-mobile-device \.push-permission-layer\s*\{[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*overflow: hidden;/
    );
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.admin-modal-backdrop,\s*body\.club-mobile-device \.payment-modal-backdrop,\s*body\.club-mobile-device \.support-modal-backdrop,\s*body\.club-mobile-device \.profile-modal-backdrop,\s*body\.club-mobile-device \.notification-center-backdrop,\s*body\.club-mobile-device \.support-confirm-backdrop,\s*body\.club-mobile-device \.payment-confirm-backdrop,\s*body\.club-mobile-device \.push-permission-layer\s*\{[\s\S]*touch-action: pan-y;/
    );
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.admin-client-modal,[\s\S]*body\.club-mobile-device \.push-permission-card,[\s\S]*body\.club-mobile-device \.admin-client-message-modal,[\s\S]*body\.club-mobile-device \.support-confirm-card\s*\{[\s\S]*width: var\(--club-mobile-modal-width\);[\s\S]*max-width: min\(40rem, var\(--club-mobile-modal-width\)\);[\s\S]*overflow: hidden;/
    );
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.admin-client-modal,[\s\S]*body\.club-mobile-device \.push-permission-card,[\s\S]*body\.club-mobile-device \.admin-client-message-modal,[\s\S]*body\.club-mobile-device \.support-confirm-card\s*\{[\s\S]*touch-action: pan-y;/
    );
    expect(mobileGuard).toContain("--club-mobile-modal-inline-gutter");
    expect(mobileGuard).toContain("--club-mobile-modal-width");
    expect(mobileGuard).toContain("--club-mobile-modal-height");
    expect(mobileGuard).not.toContain("760px");
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device :is\(\s*\.admin-client-modal,[\s\S]*\.support-confirm-card\s*\) \*\s*\{[\s\S]*min-width: 0;/
    );
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.notification-center-actions,\s*body\.club-mobile-device \.push-permission-actions\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 44px;/
    );
    expect(mobileGuard).toMatch(
      /body\.club-mobile-device \.admin-client-modal \.admin-client-summary,\s*body\.club-mobile-device \.admin-client-modal \.admin-client-profile-grid,\s*body\.club-mobile-device \.admin-client-modal \.admin-client-card-head,\s*body\.club-mobile-device \.admin-client-modal \.admin-compact-date-row\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/
    );
  });

  it("keeps mobile admin and support pages compact and scroll-safe", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");

    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-tabs\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]*overflow: visible;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-shell > \.section-head\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/
    );
    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-head-actions\s*\{[\s\S]*display: contents;/
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

  it("uses calmer light surfaces and tighter mobile admin spacing", () => {
    const styles = readFileSync(resolve(__dirname, "styles.css"), "utf-8");
    const responsiveLayer = styles.slice(styles.lastIndexOf("Responsive modal and mobile commerce system"));

    expect(responsiveLayer).toMatch(/:root\[data-theme="light"\]\s*\{[^}]*--shadow-soft: 0 8px 22px rgba\(57, 76, 104, 0\.12\);/s);
    expect(responsiveLayer).toMatch(/:root\[data-theme="light"\] body\s*\{[^}]*background:/s);
    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.admin-shell\s*\{[^}]*gap: 0\.65rem;/s);
    expect(responsiveLayer).toMatch(/body\.club-mobile-device \.admin-tabs\s*\{[^}]*padding: 0\.35rem;/s);
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
    const communityStyles = readFileSync(resolve(__dirname, "features/community/community.css"), "utf-8");

    expect(appSource).toContain("getKeyboardViewportBaseHeight");
    expect(appSource).toContain('classList.add("club-text-field-focused")');
    expect(appSource).toContain('classList.remove("club-text-field-focused")');
    expect(appSource).toContain("previousBaseHeight: keyboardViewportBaseHeight");
    expect(appSource).toContain("showBottomNavigation");
    expect(appSource).toContain("!communityChatOpen");
    expect(appSource).toContain('v-if="showBottomNavigation"');
    expect(communityStyles).toMatch(
      /body\.club-keyboard-open \.app-root\.community-chat-open\s*\{[\s\S]*height: var\(--club-visible-viewport-height, 100dvh\);/
    );
    expect(communityStyles).toMatch(
      /\.app-root\.community-chat-open\s*\{[\s\S]*inset: 0;[\s\S]*height: auto;/
    );
    expect(communityStyles).toMatch(
      /body\.club-text-field-focused \.app-root\.community-chat-open\s*\{[\s\S]*height: var\(--club-visible-viewport-height, 100dvh\);/
    );
    expect(communityStyles).toMatch(
      /html\.club-text-field-focused:has\(\.app-root\.community-chat-open\),[\s\S]*overflow: hidden;/
    );
    expect(communityStyles).toMatch(
      /body\.club-mobile-device \.community-chat-open \.chat-compose,\s*body\.club-keyboard-open \.community-chat-open \.chat-compose\s*\{[\s\S]*position: static;[\s\S]*width: 100%;/
    );
    expect(communityStyles).toMatch(
      /\.community-chat-open \.chat-input-row \.icon-button\s*\{[\s\S]*height: var\(--icon-button-size\);[\s\S]*min-width: var\(--icon-button-size\);/
    );
    expect(communityStyles).toMatch(
      /\.community-chat-open \.chat-input-row \.text-input\s*\{[\s\S]*height: var\(--icon-button-size\);[\s\S]*font-size: max\(16px, 1rem\);/
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
    expect(learningSource).not.toContain("toggleYouTubeFullscreen");
    expect(learningSource).not.toContain("lesson-youtube-native-fullscreen-hitbox");
    expect(learningSource).not.toContain("lesson-youtube-player-shell-fullscreen");
    expect(learningSource).toContain("allowfullscreen");
  });
});
