import { describe, expect, it } from "vitest";
import {
  adminPaymentProvidersResponseSchema,
  paymentCheckoutOptionsResponseSchema,
  paymentOrderLogSchema,
  paymentProductSchema,
  paymentProviderCatalogItemSchema,
  paymentProviderSchema
} from "./index";

describe("provider-neutral payment contracts", () => {
  it("exposes the immutable payment-order money snapshot while retaining nullable legacy RUB", () => {
    expect(paymentOrderLogSchema.safeParse({
      id: "order-1", status: "paid", amountRub: null, currency: "USD", amountMinor: 1999,
      providerOrderId: "provider-order-1", providerPaymentId: null, productTitle: "Premium", productKind: "one_time",
      customer: { id: "user-1", telegramId: "1", firstName: null, username: null, photoUrl: null },
      webhook: null, paidAt: null, createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z"
    }).success).toBe(true);
  });

  it("accepts Lava provider settings", () => {
    const provider = paymentProviderSchema.parse({
      id: "lava-provider",
      provider: "lava",
      title: "Lava",
      isEnabled: true,
      secretConfigured: true,
      webhookSecretConfigured: true,
      connectionState: "verified",
      lastCheckedAt: "2026-07-25T10:00:00.000Z",
      lastCheckError: null,
      webhookUrls: {
        payment: "https://club.example/api/payments/lava/webhook/payment",
        subscription: "https://club.example/api/payments/lava/webhook/subscription"
      }
    });

    expect(provider.provider).toBe("lava");
  });

  it("accepts multiple provider bindings for one tariff", () => {
    const product = paymentProductSchema.parse({
      id: "product",
      kind: "recurrent",
      title: "Клуб",
      description: null,
      badgeLabel: null,
      amountRub: 990,
      accessDays: 30,
      bindings: [
        { provider: "prodamus", enabled: true, externalProductId: "77", externalOfferId: null },
        { provider: "lava", enabled: true, externalProductId: "product-1", externalOfferId: "offer-1" }
      ],
      isPublished: true,
      archivedUntil: null,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z"
    });

    expect(product.bindings).toHaveLength(2);
  });

  it("describes a required provider choice", () => {
    const response = paymentCheckoutOptionsResponseSchema.parse({
      productId: "product",
      options: [
        { provider: "prodamus", title: "Prodamus" },
        { provider: "lava", title: "Lava" }
      ]
    });

    expect(response.options.map((option) => option.provider)).toEqual(["prodamus", "lava"]);
  });

  it("provides Lava webhook addresses before the provider is connected", () => {
    const response = adminPaymentProvidersResponseSchema.parse({
      providers: [],
      lavaWebhookUrls: {
        payment: "https://club.example/api/payments/lava/webhook/payment",
        subscription: "https://club.example/api/payments/lava/webhook/subscription"
      }
    });

    expect(response.lavaWebhookUrls).toEqual({
      payment: "https://club.example/api/payments/lava/webhook/payment",
      subscription: "https://club.example/api/payments/lava/webhook/subscription"
    });
  });

  it("preserves whether a Lava catalog item is available for tariffs", () => {
    const item = paymentProviderCatalogItemSchema.parse({
      id: "catalog-item",
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      title: "Подписка на месяц",
      kind: "recurrent",
      amountRub: 990,
      periodicity: "MONTHLY",
      isStale: false,
      isSelectable: false,
      syncedAt: "2026-07-25T10:00:00.000Z"
    });

    expect(item.isSelectable).toBe(false);
    expect(item.periodicity).toBe("MONTHLY");
  });

  it("keeps all supported minor-unit catalog prices without requiring legacy RUB fields", () => {
    const item = paymentProviderCatalogItemSchema.parse({
      id: "catalog-item",
      externalProductId: "product-1",
      externalOfferId: "offer-1",
      title: "Клуб на месяц",
      kind: "recurrent",
      amountRub: null,
      prices: [
        { currency: "RUB", amountMinor: 99000, periodicity: "MONTHLY" },
        { currency: "USD", amountMinor: 1999, periodicity: "MONTHLY" },
        { currency: "EUR", amountMinor: null, periodicity: "MONTHLY" }
      ],
      isStale: false,
      isSelectable: true,
      syncedAt: "2026-07-25T10:00:00.000Z"
    }) as unknown as { prices?: unknown };

    expect(item.prices).toEqual([
      { currency: "RUB", amountMinor: 99000, periodicity: "MONTHLY" },
      { currency: "USD", amountMinor: 1999, periodicity: "MONTHLY" },
      { currency: "EUR", amountMinor: null, periodicity: "MONTHLY" }
    ]);
  });

  it("rejects unsupported or non-positive public money", () => {
    const base = {
      id: "product",
      kind: "one_time",
      title: "Клуб",
      description: null,
      badgeLabel: null,
      amountRub: 990,
      accessDays: 30,
      isPublished: true,
      archivedUntil: null,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z"
    };

    expect(paymentProductSchema.safeParse({ ...base, prices: [{ currency: "GBP", amountMinor: 1000 }] }).success).toBe(false);
    expect(paymentProductSchema.safeParse({ ...base, prices: [{ currency: "USD", amountMinor: 0 }] }).success).toBe(false);
  });

  it("defaults price arrays to preserve legacy product and binding fixtures", () => {
    const product = paymentProductSchema.parse({
      id: "product",
      kind: "one_time",
      title: "Клуб",
      description: null,
      badgeLabel: null,
      amountRub: 990,
      accessDays: 30,
      bindings: [{ provider: "lava", enabled: true, externalProductId: "product-1", externalOfferId: "offer-1" }],
      isPublished: true,
      archivedUntil: null,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z"
    }) as unknown as { prices?: unknown; bindings: Array<{ prices?: unknown }> };

    expect(product.prices).toEqual([]);
    expect(product.bindings[0]?.prices).toEqual([]);
  });
});
