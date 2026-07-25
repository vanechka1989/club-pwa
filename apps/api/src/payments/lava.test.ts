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
      amount: 990,
      buyerLanguage: "RU"
    });
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
});
