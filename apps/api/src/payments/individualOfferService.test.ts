import { describe, expect, it } from "vitest";
import { buildIndividualOfferDraft, buildIndividualOfferNotification } from "./individualOfferService";

const provider = (code: "prodamus" | "lava") => ({
  id: `${code}-provider`,
  provider: code,
  isEnabled: true,
  secretKey: code === "prodamus" ? "encrypted-secret" : null,
  apiKey: code === "lava" ? "encrypted-api-key" : null,
  webhookSecret: code === "lava" ? "encrypted-webhook-secret" : null
});

describe("individual offer creation policy", () => {
  it("creates an immutable one-time Prodamus RUB snapshot", () => {
    expect(buildIndividualOfferDraft({
      provider: "prodamus",
      kind: "one_time",
      title: " Акционный доступ ",
      amountRub: 1490,
      accessDays: 45
    }, { providers: [provider("prodamus")], lavaCatalog: [] })).toMatchObject({
      providerId: "prodamus-provider",
      provider: "prodamus",
      kind: "one_time",
      title: "Акционный доступ",
      currency: "RUB",
      amountMinor: 149000,
      accessDays: 45,
      externalProductId: null,
      externalOfferId: null
    });
  });

  it("preserves the Prodamus id for a recurrent offer", () => {
    expect(buildIndividualOfferDraft({
      provider: "prodamus",
      kind: "recurrent",
      title: "Персональная подписка",
      amountRub: 990,
      accessDays: 30,
      externalProductId: "subscription-77"
    }, { providers: [provider("prodamus")], lavaCatalog: [] }).externalProductId).toBe("subscription-77");
  });

  it("uses a selectable fixed Lava catalog price without allowing an override", () => {
    const context = {
      providers: [provider("lava")],
      lavaCatalog: [{
        id: "11111111-1111-4111-8111-111111111111",
        externalProductId: "product-1",
        externalOfferId: "offer-1",
        title: "Lava 30 дней",
        kind: "recurrent" as const,
        amountRub: 990,
        metadata: { periodicity: "MONTHLY" },
        isStale: false,
        isSelectable: true,
        prices: [{ currency: "RUB" as const, amountMinor: 99000, periodicity: "MONTHLY" }]
      }]
    };

    expect(buildIndividualOfferDraft({
      provider: "lava",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      currency: "RUB",
      accessDays: 30
    }, context)).toMatchObject({ title: "Lava 30 дней", amountMinor: 99000, externalOfferId: "offer-1" });
    expect(() => buildIndividualOfferDraft({
      provider: "lava",
      catalogItemId: "11111111-1111-4111-8111-111111111111",
      currency: "RUB",
      accessDays: 30,
      customAmountMinor: 100
    }, context)).toThrow("INDIVIDUAL_OFFER_FIXED_PRICE");
  });

  it("escapes an offer title and links only to the authenticated app route", () => {
    const notification = buildIndividualOfferNotification({
      title: '<img src=x onerror="alert(1)">',
      currency: "RUB",
      amountMinor: 99000,
      accessDays: 30,
      expiresAt: new Date("2026-07-31T08:00:00.000Z"),
      appPath: "/payments/offers/safe_token-1"
    });

    expect(notification.bodyHtml).not.toContain("<img");
    expect(notification.bodyHtml).toContain("&lt;img");
    expect(notification.bodyHtml).toContain('href="/payments/offers/safe_token-1"');
    expect(notification.pushUrl).toBe("/payments/offers/safe_token-1");
  });
});
