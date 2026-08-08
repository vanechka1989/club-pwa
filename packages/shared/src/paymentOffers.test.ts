import { describe, expect, it } from "vitest";
import { adminIndividualPaymentOfferPayloadSchema, individualPaymentOfferSchema, userRecurrentSubscriptionSchema } from "./index";

describe("individual payment offer contracts", () => {
  it("accepts a one-time Prodamus offer with a positive RUB price", () => {
    expect(adminIndividualPaymentOfferPayloadSchema.parse({
      provider: "prodamus",
      kind: "one_time",
      title: "Персональный доступ",
      amountRub: 1490,
      accessType: "limited",
      accessDays: 45
    })).toEqual({
      provider: "prodamus",
      kind: "one_time",
      title: "Персональный доступ",
      amountRub: 1490,
      accessType: "limited",
      accessDays: 45
    });
  });

  it("requires the Prodamus subscription id for recurrent offers", () => {
    expect(adminIndividualPaymentOfferPayloadSchema.safeParse({
      provider: "prodamus",
      kind: "recurrent",
      title: "Акционная автоподписка",
      amountRub: 990,
      accessDays: 30
    }).success).toBe(false);
  });

  it("accepts lifetime personal offers for Prodamus and Lava", () => {
    expect(adminIndividualPaymentOfferPayloadSchema.parse({
      provider: "prodamus",
      kind: "one_time",
      accessType: "lifetime",
      title: "Постоянный доступ",
      amountRub: 4990,
      accessDays: null
    }).accessType).toBe("lifetime");

    expect(adminIndividualPaymentOfferPayloadSchema.parse({
      provider: "lava",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      currency: "RUB",
      accessType: "lifetime",
      accessDays: null
    }).accessType).toBe("lifetime");
  });

  it("rejects lifetime recurrent personal offers", () => {
    expect(adminIndividualPaymentOfferPayloadSchema.safeParse({
      provider: "prodamus",
      kind: "recurrent",
      accessType: "lifetime",
      title: "Ошибочная подписка",
      amountRub: 990,
      accessDays: null,
      externalProductId: "subscription-1"
    }).success).toBe(false);
  });

  it("accepts only a catalog selection for Lava.top", () => {
    expect(adminIndividualPaymentOfferPayloadSchema.parse({
      provider: "lava",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      currency: "RUB",
      accessType: "limited",
      accessDays: 30
    })).toEqual({
      provider: "lava",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      currency: "RUB",
      accessType: "limited",
      accessDays: 30
    });
    expect(adminIndividualPaymentOfferPayloadSchema.safeParse({
      provider: "lava",
      title: "Подменённый товар",
      amountRub: 1,
      accessDays: 30
    }).success).toBe(false);
  });

  it("serializes history without a plaintext token", () => {
    const parsed = individualPaymentOfferSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      provider: "prodamus",
      kind: "one_time",
      title: "Персональный доступ",
      currency: "RUB",
      amountMinor: 149000,
      accessType: "limited",
      accessDays: 45,
      status: "active",
      expiresAt: "2026-07-31T08:00:00.000Z",
      createdAt: "2026-07-30T08:00:00.000Z",
      firstOpenedAt: null,
      checkoutStartedAt: null,
      paidAt: null,
      cancelledAt: null,
      createdBy: "Главный администратор",
      orderId: null
    });

    expect(parsed).not.toHaveProperty("token");
    expect(parsed).not.toHaveProperty("tokenHash");
  });

  it("supports recurrent subscriptions created from an individual offer without a catalog product", () => {
    expect(userRecurrentSubscriptionSchema.parse({
      id: "subscription-1",
      productId: null,
      title: "Персональная подписка",
      provider: "lava",
      status: "active",
      cancelledAt: null,
      createdAt: "2026-07-30T08:00:00.000Z"
    }).productId).toBeNull();
  });
});
