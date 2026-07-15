import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestEmailCode, verifyEmailCode } from "@/api/client";
import AuthSection from "./AuthSection.vue";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn()
  };
});

function stubStandaloneDisplay(isStandalone = true, installedDisplayModes: string[] = []) {
  const modes = new Set([...(isStandalone ? ["standalone"] : []), ...installedDisplayModes]);
  const isInstalledMode = modes.size > 0;
  const getDisplayMode = (query: string) => {
    const match = query.match(/^\(display-mode:\s*([^)]+)\)$/);
    return match?.[1]?.trim() ?? null;
  };

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: getDisplayMode(query) === "browser" ? !isInstalledMode : modes.has(getDisplayMode(query) ?? ""),
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

function renderAuth(pinia = createPinia(), options: { standalone?: boolean; installedDisplayModes?: string[] } = {}) {
  stubStandaloneDisplay(options.standalone ?? true, options.installedDisplayModes ?? []);

  return render(AuthSection, {
    global: {
      plugins: [pinia]
    }
  });
}

function stubNavigatorPlatform({
  userAgent,
  platform,
  maxTouchPoints = 0,
  userAgentData
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean; platform?: string };
}) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent
  });
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints
  });
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    value: userAgentData
  });
}

describe("email auth UI", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
    stubNavigatorPlatform({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      platform: "Win32"
    });
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, devCode: null });
    vi.mocked(verifyEmailCode).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("requires the installed PWA before showing the email login form", () => {
    renderAuth(createPinia(), { standalone: false });

    expect(screen.getByRole("heading", { name: "Установите Club на Windows" })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByRole("button", { name: "Установить приложение" })).toBeTruthy();
    expect(screen.getByText(/появится в меню Пуск/)).toBeTruthy();
  });

  it("keeps the native install request path for desktop browsers", () => {
    renderAuth(createPinia(), { standalone: false });

    expect(screen.getByRole("heading", { name: "Установите Club на Windows" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Установить приложение" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Добавьте Club на экран Домой" })).toBeNull();
  });

  it("shows iPhone manual install steps immediately instead of a dead native install button", () => {
    stubNavigatorPlatform({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5
    });

    renderAuth(createPinia(), { standalone: false });

    expect(screen.getByRole("heading", { name: "Добавьте Club на экран Домой" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Установить приложение" })).toBeNull();
    expect(screen.getByText(/На iPhone установка делается через меню Safari/)).toBeTruthy();
    expect(screen.getByText("Safari iPhone")).toBeTruthy();
    expect(screen.getAllByText(/Поделиться/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/На экран Домой/).length).toBeGreaterThan(0);
  });

  it("shows Android install steps on mobile Chrome instead of desktop Windows copy", () => {
    stubNavigatorPlatform({
      userAgent: "Mozilla/5.0 AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
      maxTouchPoints: 5,
      userAgentData: {
        mobile: true,
        platform: "Android"
      }
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 393
    });

    renderAuth(createPinia(), { standalone: false });

    expect(screen.getByRole("heading", { name: "Установите Club на Android" })).toBeTruthy();
    expect(screen.getByText(/Откройте сайт в Chrome на Android/)).toBeTruthy();
    expect(screen.getByText(/Добавить на главный экран/)).toBeTruthy();
    expect(screen.queryByText(/меню Пуск/)).toBeNull();
  });

  it("shows email login inside installed desktop PWA display modes", () => {
    renderAuth(createPinia(), { standalone: false, installedDisplayModes: ["window-controls-overlay"] });

    expect(screen.getByRole("heading", { name: "Вход в клуб" })).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Установите Club на Windows" })).toBeNull();
  });

  it("switches from install gate to email login after the app opens as standalone", async () => {
    let isStandalone = false;
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

    render(AuthSection, {
      global: {
        plugins: [createPinia()]
      }
    });

    expect(screen.getByRole("heading", { name: "Установите Club на Windows" })).toBeTruthy();

    isStandalone = true;
    window.dispatchEvent(new Event("appinstalled"));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Вход в клуб" })).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Установите Club на Windows" })).toBeNull();
  });

  it("asks the shell to open the PWA installation prompt from the login gate", async () => {
    const installRequest = vi.fn();
    window.addEventListener("club-pwa-install-request", installRequest);
    renderAuth(createPinia(), { standalone: false });

    await fireEvent.click(screen.getByRole("button", { name: "Установить приложение" }));

    expect(installRequest).toHaveBeenCalledTimes(1);
    window.removeEventListener("club-pwa-install-request", installRequest);
  });

  it("shows a desktop Chrome fallback after the install button is pressed", async () => {
    renderAuth(createPinia(), { standalone: false });

    expect(screen.queryByText(/Как установить на Windows/)).toBeNull();
    expect(screen.queryByText("Safari iPhone")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Установить приложение" }));

    expect(screen.getByText(/Как установить на Windows/)).toBeTruthy();
    expect(screen.getAllByText(/иконку установки в адресной строке/).length).toBeGreaterThan(0);
    expect(screen.getByText("Chrome Windows")).toBeTruthy();
    expect(screen.getByText("Edge Windows")).toBeTruthy();
    expect(screen.getAllByText(/Сохранить и поделиться/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Safari iPhone")).toBeNull();
  });

  it("uses email auth endpoints instead of Telegram initData", () => {
    const client = readFileSync(resolve(process.cwd(), "src/api/client.ts"), "utf8");
    const session = readFileSync(resolve(process.cwd(), "src/stores/session.ts"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/App.vue"), "utf8");

    expect(client).toContain('"/auth/email/start"');
    expect(client).toContain('"/auth/email/verify"');
    expect(client).toContain('credentials: "include"');
    expect(client).not.toContain("initData");
    expect(client).not.toContain("X-Dev-Telegram-User");
    expect(session).toContain("requestEmailCode");
    expect(session).toContain("verifyEmailCode");
    expect(app).toContain("AuthSection");
  });

  it("keeps the code entry step after an email code is requested", async () => {
    const pinia = createPinia();
    const view = renderAuth(pinia);

    await fireEvent.update(screen.getByLabelText("Email"), " Ivan.Club@Example.COM ");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy());
    expect(screen.getByText("Введите 6 цифр из письма.")).toBeTruthy();
    expect(screen.queryByText("Код из письма. Введите 6 цифр из письма.")).toBeNull();
    expect(screen.queryByText(/Код отправлен на ivan.club@example.com/)).toBeNull();
    expect(screen.getByLabelText("Код")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Получить код" })).toBeNull();

    view.unmount();
    renderAuth(pinia);

    expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy();
    expect(screen.getByText("Введите 6 цифр из письма.")).toBeTruthy();
    expect(screen.queryByText("Код из письма. Введите 6 цифр из письма.")).toBeNull();
    expect(screen.getByLabelText("Код")).toBeTruthy();
  });

  it("shows the spam-folder reminder only on the email code step", async () => {
    renderAuth(createPinia());

    expect(screen.queryByText("Письмо не пришло? Проверьте папку «Спам».")).toBeNull();

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));

    expect(await screen.findByText("Письмо не пришло? Проверьте папку «Спам».")).toBeTruthy();
  });

  it("restores the code entry step after the app reloads while the user checks email", async () => {
    renderAuth(createPinia());

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy());

    cleanup();
    renderAuth(createPinia());

    expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy();
    expect(screen.getByText("Введите 6 цифр из письма.")).toBeTruthy();
    expect(screen.queryByText("Код из письма. Введите 6 цифр из письма.")).toBeNull();
    expect(screen.getByLabelText("Код")).toBeTruthy();
  });

  it("keeps the resend button disabled with a timer after the code step reloads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAuth(createPinia());

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз через 60с" }) as HTMLButtonElement).disabled).toBe(true);
    });

    cleanup();
    renderAuth(createPinia());

    await waitFor(() => {
      expect((screen.getByRole("button", { name: /Отправить код ещё раз через \d+с/ }) as HTMLButtonElement).disabled).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "Отправить код ещё раз" })).toBeNull();

    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз" }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("lets users resend the code without entering the email again after the cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAuth();

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз через 60с" }) as HTMLButtonElement).disabled).toBe(true);
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз" }) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByRole("button", { name: "Отправить код ещё раз" }));

    expect(requestEmailCode).toHaveBeenCalledTimes(2);
    expect(requestEmailCode).toHaveBeenLastCalledWith({ email: "ivan@example.com" });
  });

  it("waits one minute before allowing a repeated email code request", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAuth();

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));

    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз через 60с" }) as HTMLButtonElement).disabled).toBe(true);
    });

    await fireEvent.click(screen.getByRole("button", { name: "Отправить код ещё раз через 60с" }));
    expect(requestEmailCode).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(59_000);
    expect((screen.getByRole("button", { name: "Отправить код ещё раз через 1с" }) as HTMLButtonElement).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз" }) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByRole("button", { name: "Отправить код ещё раз" }));
    expect(requestEmailCode).toHaveBeenCalledTimes(2);
  });

  it("keeps users on the code step with a resend timer when the server returns a cooldown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(requestEmailCode).mockRejectedValueOnce(
      Object.assign(new Error("Повторный код можно получить через 42с."), {
        data: { retryAfterSeconds: 42 },
        status: 429
      })
    );
    renderAuth();

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy();
      expect((screen.getByRole("button", { name: "Отправить код ещё раз через 42с" }) as HTMLButtonElement).disabled).toBe(true);
    });

    await vi.advanceTimersByTimeAsync(41_000);
    expect((screen.getByRole("button", { name: "Отправить код ещё раз через 1с" }) as HTMLButtonElement).disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Отправить код ещё раз" }) as HTMLButtonElement).disabled).toBe(false);
    });
    expect(requestEmailCode).toHaveBeenCalledTimes(1);
  });
});
