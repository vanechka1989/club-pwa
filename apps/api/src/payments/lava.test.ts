import { describe, expect, it, vi } from "vitest";
import { createLavaClient, LavaApiError } from "./lava";

describe("Lava API client", () => {
  it("creates an invoice with the documented API fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      status: "in-progress",
      paymentUrl: "https://app.lava.top/invoice-1"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    const result = await client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-1",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: 990,
        useCustomAmount: false,
        kind: "one_time",
        accessDays: 30,
        externalProductId: "product-1",
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    });

    expect(result).toEqual({
      checkoutUrl: "https://app.lava.top/invoice-1",
      externalOrderId: "7ea82675-4ded-4133-95a7-a6efbaf165cc"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gate.lava.top/api/v3/invoice",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Api-Key": "api-key" })
      })
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      email: "buyer@example.com",
      offerId: "836b9fc5-7ae9-4a27-9642-592bc44072b7",
      currency: "RUB",
      buyerLanguage: "RU",
      clientUtm: { utm_content: "club-order-1" }
    });
  });

  it("sends the entered amount only for a dynamic-price offer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      paymentUrl: "https://app.lava.top/invoice-1"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    const product = {
      title: "Свободная цена",
      amountRub: 0,
      amountMinor: 1999,
      currency: "USD" as const,
      useCustomAmount: true,
      kind: "one_time" as const,
      accessDays: 30,
      externalProductId: "product-1",
      externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
    };

    await client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-dynamic",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product,
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({ currency: "USD", amount: 19.99 }));
  });

  it("finds an ambiguously-created invoice by the stable merchant order id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
        clientUtm: { utm_content: "club-offer-1" }
      }],
      page: 1,
      size: 100,
      total: 1
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    await expect(client.findExternalOrderId?.({
      credentials: { apiKey: "api-key" },
      merchantOrderId: "club-offer-1",
      createdAt: new Date("2026-07-30T08:00:00.000Z"),
      buyerEmail: "buyer@example.com"
    })).resolves.toBe("7ea82675-4ded-4133-95a7-a6efbaf165cc");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/v2/invoices?");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("buyerEmail=buyer%40example.com");
  });

  it("fails closed when Lava omits pagination proof during invoice lookup", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    });

    await expect(client.findExternalOrderId?.({
      credentials: { apiKey: "api-key" },
      merchantOrderId: "club-offer-1",
      createdAt: new Date("2026-07-30T08:00:00.000Z")
    })).rejects.toEqual(new LavaApiError("LAVA_INVALID_RESPONSE"));
  });

  it("fails closed when Lava returns a different invoice page than requested", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        items: [], page: 2, size: 100, total: 0
      }), { status: 200 }))
    });

    await expect(client.findExternalOrderId?.({
      credentials: { apiKey: "api-key" },
      merchantOrderId: "club-offer-1",
      createdAt: new Date("2026-07-30T08:00:00.000Z")
    })).rejects.toEqual(new LavaApiError("LAVA_INVALID_RESPONSE"));
  });

  it("lets Lava resolve the selected fixed-currency price from the offer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      paymentUrl: "https://app.lava.top/invoice-1"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    await client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-fixed-usd",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: null,
        amountMinor: 1999,
        currency: "USD",
        useCustomAmount: false,
        kind: "one_time",
        accessDays: 30,
        externalProductId: "product-1",
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({ currency: "USD" }));
    expect(JSON.parse(String(request.body))).not.toHaveProperty("amount");
  });

  it("maps authorization and throttling errors to safe codes", async () => {
    const unauthorized = createLavaClient({
      apiKey: "secret-key",
      fetch: vi.fn().mockResolvedValue(new Response('{"error":"secret-key rejected"}', { status: 401 }))
    });
    const throttled = createLavaClient({
      apiKey: "secret-key",
      fetch: vi.fn().mockResolvedValue(new Response("", { status: 429 }))
    });

    await expect(unauthorized.checkConnection({ apiKey: "secret-key" })).rejects.toEqual(new LavaApiError("LAVA_UNAUTHORIZED"));
    await expect(throttled.checkConnection({ apiKey: "secret-key" })).rejects.toEqual(new LavaApiError("LAVA_RATE_LIMITED"));
  });

  it("accepts and normalizes the current direct Lava product catalog format", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      items: [{
        id: "product-1",
        title: "Клуб",
        type: "SUBSCRIPTION",
        offers: [{
          id: "offer-1",
          name: "Клуб на месяц",
          prices: [{ amount: 990, currency: "RUB", periodicity: "MONTHLY" }],
          recurrent: "ENABLED"
        }]
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    await expect(client.checkConnection({ apiKey: "api-key" })).resolves.toBeUndefined();
    await expect(client.listCatalog({ apiKey: "api-key" })).resolves.toEqual([{
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      title: "Клуб на месяц",
      kind: "recurrent",
      amountRub: 990,
      prices: [{ currency: "RUB", amountMinor: 99000, periodicity: "MONTHLY" }],
      metadata: {
        productType: "SUBSCRIPTION",
        periodicity: "MONTHLY"
      }
    }]);
  });

  it("preserves RUB, USD, and EUR catalog prices as exact minor units", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        items: [{
          id: "product-1",
          title: "Клуб",
          offers: [{
            id: "offer-1",
            prices: [
              { amount: 990, currency: "RUB" },
              { amount: 19.99, currency: "USD" },
              { amount: 17.5, currency: "EUR" }
            ]
          }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    await expect(client.listCatalog({ apiKey: "api-key" })).resolves.toEqual([
      expect.objectContaining({
        prices: [
          { currency: "RUB", amountMinor: 99000, periodicity: "ONE_TIME" },
          { currency: "USD", amountMinor: 1999, periodicity: "ONE_TIME" },
          { currency: "EUR", amountMinor: 1750, periodicity: "ONE_TIME" }
        ]
      })
    ]);
  });

  it("keeps one price per currency and billing period when Lava repeats exact rows", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        items: [{
          id: "product-1",
          title: "Клуб",
          offers: [{
            id: "offer-1",
            prices: [
              { amount: 20, currency: "USD", periodicity: "MONTHLY" },
              { amount: 20, currency: "USD", periodicity: "MONTHLY" },
              { amount: 120, currency: "USD", periodicity: "PERIOD_180_DAYS" },
              { amount: 200, currency: "EUR", periodicity: "PERIOD_YEAR" },
              { amount: 1500, currency: "RUB", periodicity: "MONTHLY" }
            ]
          }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    await expect(client.listCatalog({ apiKey: "api-key" })).resolves.toEqual([
      expect.objectContaining({
        prices: [
          { currency: "USD", amountMinor: 2000, periodicity: "MONTHLY" },
          { currency: "USD", amountMinor: 12000, periodicity: "PERIOD_180_DAYS" },
          { currency: "EUR", amountMinor: 20000, periodicity: "PERIOD_YEAR" },
          { currency: "RUB", amountMinor: 150000, periodicity: "MONTHLY" }
        ]
      })
    ]);
  });

  it("rejects conflicting amounts for the same currency and billing period", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        items: [{
          id: "product-1",
          offers: [{
            id: "offer-1",
            prices: [
              { amount: 20, currency: "USD", periodicity: "MONTHLY" },
              { amount: 21, currency: "USD", periodicity: "MONTHLY" }
            ]
          }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    await expect(client.listCatalog({ apiKey: "api-key" })).rejects.toEqual(new LavaApiError("LAVA_INVALID_RESPONSE"));
  });

  it("sends the Lava subscription periodicity derived from access days", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      paymentUrl: "https://app.lava.top/subscription-1"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });
    await client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-2",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: 990,
        kind: "recurrent",
        accessDays: 30,
        externalProductId: "product-1",
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      currency: "RUB",
      periodicity: "MONTHLY"
    }));
    expect(JSON.parse(String(request.body))).not.toHaveProperty("amount");
  });

  it("lets Lava resolve a fixed foreign-currency subscription price", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      paymentUrl: "https://app.lava.top/subscription-usd"
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    await client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-recurrent-usd",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: null,
        amountMinor: 128,
        currency: "USD",
        useCustomAmount: false,
        kind: "recurrent",
        accessDays: 30,
        externalProductId: "product-1",
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({
      currency: "USD",
      periodicity: "MONTHLY"
    }));
    expect(JSON.parse(String(request.body))).not.toHaveProperty("amount");
  });

  it("rejects an unsafe or malformed checkout response", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
        paymentUrl: "http://unsafe.example/invoice"
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    await expect(client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-1",
      user: { id: "user-1", telegramId: "123", email: "buyer@example.com" },
      product: {
        title: "Клуб",
        amountRub: 990,
        kind: "one_time",
        accessDays: 30,
        externalProductId: null,
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    })).rejects.toEqual(new LavaApiError("LAVA_INVALID_RESPONSE"));
  });

  it("identifies when Lava rejects the buyer email", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: "Incorrect email to purchase",
        details: {}
      }), { status: 400, headers: { "content-type": "application/json" } }))
    });

    await expect(client.createCheckout({
      credentials: { apiKey: "api-key" },
      orderId: "club-order-1",
      user: { id: "user-1", telegramId: "123", email: "owner@example.com" },
      product: {
        title: "Клуб",
        amountRub: 1200,
        amountMinor: 120000,
        currency: "RUB",
        useCustomAmount: false,
        kind: "recurrent",
        accessDays: 365,
        externalProductId: "product-1",
        externalOfferId: "836b9fc5-7ae9-4a27-9642-592bc44072b7"
      },
      returnUrl: "https://club.example/",
      notificationUrl: "https://club.example/api/payments/lava/webhook/payment"
    })).rejects.toEqual(new LavaApiError("LAVA_BUYER_EMAIL_REJECTED"));
  });

  it("normalizes a completed invoice during reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      type: "INVOICE",
      datetime: "2026-07-25T12:00:00.000Z",
      status: "COMPLETED",
      receipt: { amount: 990, currency: "RUB" },
      buyer: { email: "buyer@example.com" },
      subscriptionStatus: null,
      parentInvoice: null
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });

    const event = await client.getOrderStatus?.({
      credentials: { apiKey: "api-key" },
      externalOrderId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      productId: "product-1",
      buyerEmail: "buyer@example.com",
      currency: "RUB",
      amountMinor: 99000
    });

    expect(event).toEqual(expect.objectContaining({
      provider: "lava",
      type: "payment_succeeded",
      externalOrderId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      currency: "RUB",
      amountMinor: 99000
    }));
    expect(event).not.toHaveProperty("amountRub");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gate.lava.top/api/v2/invoices/7ea82675-4ded-4133-95a7-a6efbaf165cc",
      expect.any(Object)
    );
  });

  it("normalizes a foreign-currency reconciliation amount without losing cents", async () => {
    const client = createLavaClient({
      apiKey: "api-key",
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({
        id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
        type: "INVOICE",
        datetime: "2026-07-25T12:00:00.000Z",
        status: "COMPLETED",
        receipt: { amount: 19.99, currency: "usd" },
        buyer: { email: "buyer@example.com" }
      }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    await expect(client.getOrderStatus?.({
      credentials: { apiKey: "api-key" },
      externalOrderId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      productId: "product-1",
      buyerEmail: "buyer@example.com",
      currency: "USD",
      amountMinor: 1999
    })).resolves.toMatchObject({ currency: "USD", amountMinor: 1999 });
  });

  it("normalizes a cancelled subscription during reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      datetime: "2026-07-25T12:00:00.000Z",
      status: "COMPLETED",
      receipt: { amount: 990, currency: "RUB" },
      buyer: { email: "buyer@example.com" },
      periodicity: "MONTHLY",
      subscriptionStatus: "CANCELLED",
      cancelledAt: "2026-07-25T13:00:00.000Z",
      recurrentPayments: []
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createLavaClient({ apiKey: "api-key", fetch: fetchMock });
    const events = await client.getSubscriptionEvents?.({
      credentials: { apiKey: "api-key" },
      externalSubscriptionId: "7ea82675-4ded-4133-95a7-a6efbaf165cc",
      productId: "product-1",
      buyerEmail: "buyer@example.com"
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "subscription_cancelled",
        externalSubscriptionId: "7ea82675-4ded-4133-95a7-a6efbaf165cc"
      })
    ]);
  });
});
