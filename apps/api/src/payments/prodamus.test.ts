import { describe, expect, it } from "vitest";
import {
  buildProdamusPaymentUrl,
  createProdamusSignature,
  normalizeProdamusFormUrl,
  verifyProdamusSignature
} from "./prodamus";

describe("prodamus payment helpers", () => {
  it("normalizes payment form urls", () => {
    expect(normalizeProdamusFormUrl("demo.payform.ru")).toBe("https://demo.payform.ru/");
    expect(normalizeProdamusFormUrl("https://demo.payform.ru")).toBe("https://demo.payform.ru/");
    expect(normalizeProdamusFormUrl("https://demo.payform.ru/custom")).toBe("https://demo.payform.ru/custom/");
  });

  it("creates stable signatures independent of object key order", () => {
    const secretKey = "secret";
    const first = createProdamusSignature(
      {
        order_id: "order-1",
        products: [{ price: 1000, quantity: 1, name: "Premium" }],
        customer_extra: "telegram:100"
      },
      secretKey
    );
    const second = createProdamusSignature(
      {
        customer_extra: "telegram:100",
        products: [{ name: "Premium", quantity: 1, price: 1000 }],
        order_id: "order-1"
      },
      secretKey
    );

    expect(first).toBe(second);
    expect(verifyProdamusSignature({ order_id: "order-1" }, secretKey, createProdamusSignature({ order_id: "order-1" }, secretKey))).toBe(
      true
    );
    expect(verifyProdamusSignature({ order_id: "order-1" }, secretKey, "invalid")).toBe(false);
  });

  it("builds one-time payment urls with product and customer metadata", () => {
    const url = new URL(
      buildProdamusPaymentUrl({
        formUrl: "demo.payform.ru",
        secretKey: "secret",
        sys: "clubcrm",
        orderId: "order-1",
        userTelegramId: "100",
        product: {
          title: "Premium",
          amountRub: 990,
          kind: "one_time",
          accessDays: 30,
          prodamusSubscriptionId: null
        },
        returnUrl: "https://club.example/payments"
      })
    );

    expect(url.origin).toBe("https://demo.payform.ru");
    expect(url.searchParams.get("do")).toBe("pay");
    expect(url.searchParams.get("sys")).toBe("clubcrm");
    expect(url.searchParams.get("order_id")).toBe("order-1");
    expect(url.searchParams.get("customer_extra")).toBe("telegram:100");
    expect(url.searchParams.get("products[0][name]")).toBe("Premium");
    expect(url.searchParams.get("products[0][price]")).toBe("990");
    expect(url.searchParams.get("products[0][quantity]")).toBe("1");
    expect(url.searchParams.get("signature")).toBeTruthy();
    expect(url.searchParams.has("subscription")).toBe(false);
  });

  it("builds recurrent payment urls with prodamus subscription id", () => {
    const url = new URL(
      buildProdamusPaymentUrl({
        formUrl: "https://demo.payform.ru/",
        secretKey: "secret",
        sys: "clubcrm",
        orderId: "order-2",
        userTelegramId: "200",
        product: {
          title: "Monthly",
          amountRub: 1490,
          kind: "recurrent",
          accessDays: 30,
          prodamusSubscriptionId: "77"
        },
        returnUrl: "https://club.example/payments"
      })
    );

    expect(url.searchParams.get("subscription")).toBe("77");
  });
});
