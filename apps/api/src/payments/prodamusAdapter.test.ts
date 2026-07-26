import { describe, expect, it } from "vitest";
import { prodamusAdapter } from "./prodamusAdapter";

describe("Prodamus payment adapter", () => {
  it("preserves the existing signed checkout URL", async () => {
    const result = await prodamusAdapter.createCheckout({
      credentials: {
        formUrl: "https://pay.example.com",
        secretKey: "secret",
        sys: "club"
      },
      orderId: "club-order-1",
      user: {
        id: "user-1",
        telegramId: "123",
        email: "buyer@example.com"
      },
      product: {
        title: "Клуб",
        amountRub: 990,
        kind: "recurrent",
        accessDays: 30,
        externalProductId: "77",
        externalOfferId: null
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/prodamus/webhook"
    });

    const url = new URL(result.checkoutUrl);
    expect(url.searchParams.get("order_id")).toBe("club-order-1");
    expect(url.searchParams.get("subscription")).toBe("77");
    expect(url.searchParams.get("urlNotification")).toBe("https://club.example/api/payments/prodamus/webhook");
    expect(url.searchParams.get("signature")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses the immutable RUB minor-unit snapshot for checkout", async () => {
    const result = await prodamusAdapter.createCheckout({
      credentials: { formUrl: "https://pay.example.com", secretKey: "secret", sys: "club" },
      orderId: "club-order-rub-snapshot",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: null,
        amountMinor: 199900,
        currency: "RUB",
        kind: "one_time",
        accessDays: 30,
        externalProductId: null,
        externalOfferId: null
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/prodamus/webhook"
    });

    expect(new URL(result.checkoutUrl).searchParams.get("products[0][price]")).toBe("1999");
  });

  it("rejects a minor-unit snapshot without an explicit RUB currency", async () => {
    await expect(prodamusAdapter.createCheckout({
      credentials: { formUrl: "https://pay.example.com", secretKey: "secret", sys: "club" },
      orderId: "club-order-ambiguous-snapshot",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: null,
        amountMinor: 1999,
        kind: "one_time",
        accessDays: 30,
        externalProductId: null,
        externalOfferId: null
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/prodamus/webhook"
    })).rejects.toThrow("Prodamus requires an explicit RUB snapshot");
  });
});
