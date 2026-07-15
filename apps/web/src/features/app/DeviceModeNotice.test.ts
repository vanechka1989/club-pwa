import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "./i18n";
import DeviceModeNotice from "./DeviceModeNotice.vue";

const { toDataURL } = vi.hoisted(() => ({ toDataURL: vi.fn() }));

vi.mock("qrcode", () => ({
  default: { toDataURL }
}));

describe("DeviceModeNotice", () => {
  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue("data:image/png;base64,qr");
    useI18n().setLocale("ru");
  });

  afterEach(() => cleanup());

  it("shows desktop guidance, generates a local QR image and continues without blocking", async () => {
    const view = render(DeviceModeNotice, {
      props: { kind: "desktop", qrTarget: "https://club.example/" }
    });

    expect(screen.getByRole("dialog", { name: "Приложение оптимизировано для телефона" })).toBeTruthy();
    expect(screen.getByText("Откройте его на смартфоне в мобильном режиме.")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByAltText("QR-код для открытия приложения на телефоне").getAttribute("src")).toBe(
        "data:image/png;base64,qr"
      );
    });
    expect(toDataURL).toHaveBeenCalledWith("https://club.example/", expect.objectContaining({ margin: 1, width: 256 }));

    await fireEvent.click(screen.getByRole("button", { name: "Всё равно продолжить" }));
    expect(view.emitted().continue).toHaveLength(1);
  });

  it("shows browser desktop-mode guidance on a phone without a QR image", () => {
    render(DeviceModeNotice, {
      props: { kind: "mobile-desktop", qrTarget: "https://club.example/" }
    });

    expect(screen.getByRole("dialog", { name: "Включена версия сайта для компьютера" })).toBeTruthy();
    expect(screen.getByText("Для корректной работы отключите «Версия для ПК» в настройках браузера.")).toBeTruthy();
    expect(screen.queryByAltText("QR-код для открытия приложения на телефоне")).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it("renders the same guidance in English", () => {
    useI18n().setLocale("en");
    render(DeviceModeNotice, {
      props: { kind: "mobile-desktop", qrTarget: "https://club.example/" }
    });

    expect(screen.getByRole("dialog", { name: "Desktop site mode is enabled" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue anyway" })).toBeTruthy();
  });
});
