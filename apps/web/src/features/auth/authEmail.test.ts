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

function stubStandaloneDisplay(isStandalone = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === "(display-mode: standalone)" ? isStandalone : false,
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

function renderAuth(pinia = createPinia(), options: { standalone?: boolean } = {}) {
  stubStandaloneDisplay(options.standalone ?? true);

  return render(AuthSection, {
    global: {
      plugins: [pinia]
    }
  });
}

describe("email auth UI", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, devCode: null });
    vi.mocked(verifyEmailCode).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("requires the installed PWA before showing the email login form", () => {
    renderAuth(createPinia(), { standalone: false });

    expect(screen.getByRole("heading", { name: "Установите приложение" })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByRole("button", { name: "Установить приложение" })).toBeTruthy();
    expect(screen.getByText(/Вход по email доступен только из установленного приложения/)).toBeTruthy();
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

    expect(screen.queryByText(/Chrome не открыл окно установки автоматически/)).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Установить приложение" }));

    expect(screen.getByText(/Chrome не открыл окно установки автоматически/)).toBeTruthy();
    expect(screen.getByText(/иконку установки в адресной строке/)).toBeTruthy();
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
    expect(screen.getByText("Код отправлен на ivan.club@example.com. Введите 6 цифр ниже.")).toBeTruthy();
    expect(screen.getByLabelText("Код")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Получить код" })).toBeNull();

    view.unmount();
    renderAuth(pinia);

    expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy();
    expect(screen.getByText("Код отправлен на ivan.club@example.com. Введите 6 цифр ниже.")).toBeTruthy();
    expect(screen.getByLabelText("Код")).toBeTruthy();
  });

  it("restores the code entry step after the app reloads while the user checks email", async () => {
    renderAuth(createPinia());

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy());

    cleanup();
    renderAuth(createPinia());

    expect(screen.getByRole("heading", { name: "Код из письма" })).toBeTruthy();
    expect(screen.getByText("Код отправлен на ivan@example.com. Введите 6 цифр ниже.")).toBeTruthy();
    expect(screen.getByLabelText("Код")).toBeTruthy();
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
