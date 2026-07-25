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
});
