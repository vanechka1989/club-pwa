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
      buyerLanguage: "RU"
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
    expect(JSON.parse(String(request.body))).toEqual(expect.objectContaining({ periodicity: "MONTHLY" }));
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
      amountRub: 990
    });

    expect(event).toEqual(expect.objectContaining({
      provider: "lava",
      type: "payment_succeeded",
      externalOrderId: "7ea82675-4ded-4133-95a7-a6efbaf165cc"
    }));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gate.lava.top/api/v2/invoices/7ea82675-4ded-4133-95a7-a6efbaf165cc",
      expect.any(Object)
    );
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
      buyerEmail: "buyer@example.com",
      amountRub: 990
    });

    expect(events).toEqual([
      expect.objectContaining({
        type: "subscription_cancelled",
        externalSubscriptionId: "7ea82675-4ded-4133-95a7-a6efbaf165cc"
      })
    ]);
  });
});
