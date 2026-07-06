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

function renderAuth(pinia = createPinia()) {
  return render(AuthSection, {
    global: {
      plugins: [pinia]
    }
  });
}

describe("email auth UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestEmailCode).mockResolvedValue({ ok: true, devCode: null });
    vi.mocked(verifyEmailCode).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
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

  it("lets users resend the code without entering the email again", async () => {
    renderAuth();

    await fireEvent.update(screen.getByLabelText("Email"), "ivan@example.com");
    await fireEvent.click(screen.getByRole("button", { name: "Получить код" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Отправить код ещё раз" })).toBeTruthy());

    await fireEvent.click(screen.getByRole("button", { name: "Отправить код ещё раз" }));

    expect(requestEmailCode).toHaveBeenCalledTimes(2);
    expect(requestEmailCode).toHaveBeenLastCalledWith({ email: "ivan@example.com" });
  });
});
