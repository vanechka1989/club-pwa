import { describe, expect, it } from "vitest";
import { paymentProductMutationError } from "./paymentProductMutation";

describe("payment product money compatibility", () => {
  it("allows a Lava-only product to retain no legacy RUB amount", () => {
    expect(paymentProductMutationError(null, [{ provider: "lava", enabled: true }])).toBeNull();
  });

  it("rejects an enabled Prodamus binding without a positive RUB amount", () => {
    expect(paymentProductMutationError(null, [{ provider: "prodamus", enabled: true }]))
      .toBe("Для Prodamus укажите цену в рублях.");
  });
});
