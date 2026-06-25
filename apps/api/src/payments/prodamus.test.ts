import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  buildProdamusPaymentUrl,
  buildProdamusSetActivityRequest,
  createProdamusSignature,
  getProdamusNotificationOrderId,
  getProdamusSubscriptionIdentity,
  normalizeProdamusWebhookPayload,
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

  it("matches the documented Prodamus HMAC canonical payload", () => {
    const signature = createProdamusSignature(
      {
        order_id: "order-1",
        products: [{ price: 990, quantity: 1, name: "Premium" }],
        urlReturn: "https://club.example/",
        urlNotification: "https://club.example/api/payments/prodamus/webhook"
      },
      "secret"
    );

    const canonicalPayload =
      '{"order_id":"order-1","products":[{"name":"Premium","price":"990","quantity":"1"}],"urlNotification":"https:\\/\\/club.example\\/api\\/payments\\/prodamus\\/webhook","urlReturn":"https:\\/\\/club.example\\/"}';

    expect(signature).toBe(createHmac("sha256", "secret").update(canonicalPayload).digest("hex"));
  });

  it("normalizes Prodamus flat webhook fields before signature verification", () => {
    const flatPayload = {
      order_id: "46102525",
      order_num: "club-order-1",
      "products[0][name]": "Premium",
      "products[0][price]": "990.00",
      "products[0][quantity]": "1",
      payment_status: "success"
    };
    const normalizedPayload = normalizeProdamusWebhookPayload(flatPayload);
    const signature = createProdamusSignature(
      {
        order_id: "46102525",
        order_num: "club-order-1",
        products: [{ name: "Premium", price: "990.00", quantity: "1" }],
        payment_status: "success"
      },
      "secret"
    );

    expect(normalizedPayload.products).toEqual([{ name: "Premium", price: "990.00", quantity: "1" }]);
    expect(verifyProdamusSignature(normalizedPayload, "secret", signature)).toBe(true);
  });

  it("uses order_num as the client order id in Prodamus notifications", () => {
    expect(getProdamusNotificationOrderId({ order_id: "46102525", order_num: "club-order-1" })).toBe("club-order-1");
    expect(getProdamusNotificationOrderId({ order_id: "club-order-2" })).toBe("club-order-2");
  });

  it("builds one-time payment urls with product and customer metadata", () => {
    const url = new URL(
      buildProdamusPaymentUrl({
        formUrl: "demo.payform.ru",
        secretKey: "secret",
        sys: "",
        orderId: "order-1",
        userTelegramId: "100",
        product: {
          title: "Premium",
          amountRub: 990,
          kind: "one_time",
          accessDays: 30,
          prodamusSubscriptionId: null
        },
        returnUrl: "https://club.example/payments",
        notificationUrl: "https://club.example/api/payments/prodamus/webhook"
      })
    );

    expect(url.origin).toBe("https://demo.payform.ru");
    expect(url.searchParams.get("do")).toBe("pay");
    expect(url.searchParams.get("sys")).toBeNull();
    expect(url.searchParams.get("order_id")).toBe("order-1");
    expect(url.searchParams.get("customer_extra")).toBe("telegram:100");
    expect(url.searchParams.get("_param_telegram_id")).toBe("100");
    expect(url.searchParams.get("urlNotification")).toBe("https://club.example/api/payments/prodamus/webhook");
    expect(url.searchParams.get("callbackType")).toBe("json");
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
        returnUrl: "https://club.example/payments",
        notificationUrl: "https://club.example/api/payments/prodamus/webhook",
        subscriptionDateStart: new Date(2026, 5, 25, 9, 5)
      })
    );

    expect(url.searchParams.get("subscription")).toBe("77");
    expect(url.searchParams.get("subscription_date_start")).toBe("2026-6-25 09:05");
    expect(url.searchParams.get("products[0][price]")).toBe("1490");
    expect(url.searchParams.get("products[0][quantity]")).toBe("1");
  });

  it("builds setActivity requests for recurrent subscription cancellation by manager", () => {
    const request = buildProdamusSetActivityRequest({
      formUrl: "https://demo.payform.ru/",
      secretKey: "secret",
      subscriptionId: "77",
      telegramId: "123456",
      activeManager: false
    });

    expect(request.url).toBe("https://demo.payform.ru/rest/setActivity/");
    expect(request.body.get("subscription")).toBe("77");
    expect(request.body.get("tg_user_id")).toBe("123456");
    expect(request.body.get("active_user")).toBeNull();
    expect(request.body.get("active_manager")).toBe("0");
    expect(request.body.get("signature")).toBe(
      createProdamusSignature(
        {
          subscription: "77",
          tg_user_id: "123456",
          active_manager: 0
        },
        "secret"
      )
    );
  });

  it("builds setActivity requests for recurrent subscription restore by manager", () => {
    const request = buildProdamusSetActivityRequest({
      formUrl: "https://demo.payform.ru/",
      secretKey: "secret",
      subscriptionId: "77",
      profileId: "1209736",
      activeManager: true
    });

    expect(request.body.get("subscription")).toBe("77");
    expect(request.body.get("profile")).toBe("1209736");
    expect(request.body.get("active_user")).toBeNull();
    expect(request.body.get("active_manager")).toBe("1");
    expect(request.body.get("signature")).toBe(
      createProdamusSignature(
        {
          subscription: "77",
          profile: "1209736",
          active_manager: 1
        },
        "secret"
      )
    );
  });

  it("prefers Prodamus profile id for setActivity requests", () => {
    const request = buildProdamusSetActivityRequest({
      formUrl: "https://demo.payform.ru/",
      secretKey: "secret",
      subscriptionId: "77",
      profileId: "1209736",
      telegramId: "123456",
      activeManager: false
    });

    expect(request.body.get("profile")).toBe("1209736");
    expect(request.body.get("tg_user_id")).toBeNull();
    expect(request.body.get("signature")).toBe(
      createProdamusSignature(
        {
          subscription: "77",
          profile: "1209736",
          active_manager: 0
        },
        "secret"
      )
    );
  });

  it("extracts Prodamus subscription identity from paid webhook payload", () => {
    expect(
      getProdamusSubscriptionIdentity(
        {
          customer_email: "client@example.com",
          customer_phone: "+79999999999",
          subscription: {
            profile_id: "1209736"
          }
        },
        "123456"
      )
    ).toEqual({
      profileId: "1209736",
      customerEmail: "client@example.com",
      customerPhone: "+79999999999",
      telegramId: "123456"
    });
  });
});
