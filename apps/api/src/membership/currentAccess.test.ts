import { describe, expect, it } from "vitest";
import { resolveCurrentAccess } from "./currentAccess";

const expiresAt = new Date("2031-01-01T00:00:00.000Z");

describe("resolveCurrentAccess", () => {
  it("describes administrator access as a gift", () => {
    expect(resolveCurrentAccess({
      membershipStatus: "active",
      provider: "manual",
      expiresAt,
      nextPaymentAt: null,
      product: null,
      bonusDays: null
    })).toEqual({
      source: "gift",
      title: "Подарочная подписка",
      accessDays: null,
      bonusDays: null,
      expiresAt: "2031-01-01T00:00:00.000Z",
      nextPaymentAt: null
    });
  });

  it("describes referral access with the activated bonus", () => {
    expect(resolveCurrentAccess({
      membershipStatus: "active",
      provider: "referral_bonus",
      expiresAt,
      nextPaymentAt: null,
      product: null,
      bonusDays: 14
    })).toMatchObject({ source: "referral", title: "Реферальный бонус", bonusDays: 14 });
  });

  it("uses the paid product snapshot for one-time access", () => {
    expect(resolveCurrentAccess({
      membershipStatus: "active",
      provider: "lava",
      expiresAt,
      nextPaymentAt: null,
      product: { title: "Клуб Premium", kind: "one_time", accessDays: 30 },
      bonusDays: null
    })).toMatchObject({ source: "one_time", title: "Клуб Premium", accessDays: 30 });
  });

  it("uses the recurring product and next payment date", () => {
    expect(resolveCurrentAccess({
      membershipStatus: "active",
      provider: "prodamus_recurrent",
      expiresAt,
      nextPaymentAt: expiresAt,
      product: { title: "Клуб Premium", kind: "recurrent", accessDays: 30 },
      bonusDays: null
    })).toMatchObject({
      source: "recurrent",
      title: "Клуб Premium",
      accessDays: 30,
      nextPaymentAt: "2031-01-01T00:00:00.000Z"
    });
  });

  it("falls back safely for incomplete historical data and inactive access", () => {
    expect(resolveCurrentAccess({
      membershipStatus: "active",
      provider: "legacy",
      expiresAt,
      nextPaymentAt: null,
      product: null,
      bonusDays: null
    })).toMatchObject({ source: "unknown", title: "Доступ к клубу" });
    expect(resolveCurrentAccess({
      membershipStatus: "inactive",
      provider: null,
      expiresAt: null,
      nextPaymentAt: null,
      product: null,
      bonusDays: null
    })).toBeNull();
  });
});
