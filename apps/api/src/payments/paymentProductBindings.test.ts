import { describe, expect, it } from "vitest";
import { validateSingleEnabledPaymentBinding } from "./paymentProductBindings";

const binding = (provider: "prodamus" | "lava", enabled: boolean) => ({
  provider,
  enabled,
  externalProductId: null,
  externalOfferId: null
});

describe("payment product provider bindings", () => {
  it("accepts exactly one enabled provider", () => {
    expect(validateSingleEnabledPaymentBinding([
      binding("prodamus", true),
      binding("lava", false)
    ])).toEqual({ ok: true, provider: "prodamus" });
  });

  it("rejects a product without an enabled provider", () => {
    expect(validateSingleEnabledPaymentBinding([
      binding("prodamus", false),
      binding("lava", false)
    ])).toEqual({
      ok: false,
      error: "Выберите одну платёжную систему."
    });
  });

  it("rejects a product with two enabled providers", () => {
    expect(validateSingleEnabledPaymentBinding([
      binding("prodamus", true),
      binding("lava", true)
    ])).toEqual({
      ok: false,
      error: "Для тарифа можно выбрать только одну платёжную систему."
    });
  });
});
