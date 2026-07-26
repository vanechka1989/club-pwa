import { describe, expect, it, vi } from "vitest";
import { formatPaymentReceivedMessage, notifyPaymentReceived } from "./paymentNotification";
import { createAppNotification } from "../notifications/create";

vi.mock("../notifications/create", () => ({
  createAppNotification: vi.fn().mockResolvedValue({ id: "notification-id" })
}));

describe("payment notification", () => {
  it("formats payment received messages with the stored currency and cents", () => {
    expect(
      formatPaymentReceivedMessage({
        productTitle: "Подписка на 1 месяц",
        currency: "USD",
        amountMinor: 1999,
        expiresAt: new Date("2026-07-25T14:00:00.000Z")
      })
    ).toBe("Оплата получена.\nТариф: Подписка на 1 месяц\nСумма: 19,99 $\nДоступ активен до 25.07.2026.");
  });

  it("creates payment received app notification", async () => {
    await notifyPaymentReceived({
      userId: "user-1",
      productTitle: "Подписка на 1 месяц",
      currency: "EUR",
      amountMinor: 1750,
      expiresAt: new Date("2026-07-25T14:00:00.000Z")
    });

    expect(createAppNotification).toHaveBeenCalledWith({
      userId: "user-1",
      kind: "payment",
      title: "Оплата получена",
      body: "Оплата получена.\nТариф: Подписка на 1 месяц\nСумма: 17,50 €\nДоступ активен до 25.07.2026.",
      source: "payment",
      sourceId: null
    });
  });
});
