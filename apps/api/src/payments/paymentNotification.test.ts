import { describe, expect, it, vi } from "vitest";
import { formatPaymentReceivedMessage, notifyPaymentReceived } from "./paymentNotification";

describe("payment notification", () => {
  it("formats payment received message for Telegram", () => {
    expect(
      formatPaymentReceivedMessage({
        productTitle: "Подписка на 1 месяц",
        amountRub: 50,
        expiresAt: new Date("2026-07-25T14:00:00.000Z")
      })
    ).toBe("Оплата получена.\nТариф: Подписка на 1 месяц\nСумма: 50 ₽\nДоступ активен до 25.07.2026.");
  });

  it("sends payment received notification with miniapp button", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await notifyPaymentReceived({
      telegramId: "6386988324",
      productTitle: "Подписка на 1 месяц",
      amountRub: 50,
      expiresAt: new Date("2026-07-25T14:00:00.000Z"),
      webOrigin: "https://club.example",
      send
    });

    expect(send).toHaveBeenCalledWith({
      chatId: "6386988324",
      text: "Оплата получена.\nТариф: Подписка на 1 месяц\nСумма: 50 ₽\nДоступ активен до 25.07.2026.",
      replyMarkup: {
        inline_keyboard: [[{ text: "Открыть клуб", web_app: { url: "https://club.example" } }]]
      }
    });
  });
});
