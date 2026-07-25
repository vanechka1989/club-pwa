import { describe, expect, it } from "vitest";
import {
  adminPaymentProvidersResponseSchema,
  paymentCheckoutOptionsResponseSchema,
  paymentProductSchema,
  paymentProviderCatalogItemSchema,
  paymentProviderSchema
} from "./index";

describe("provider-neutral payment contracts", () => {
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
});
