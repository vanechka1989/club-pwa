import { describe, expect, it, vi } from "vitest";
import { runProductBindingMutation } from "./productMutationOrchestration";

const lava = { provider: "lava" as const, enabled: true, externalProductId: "product", externalOfferId: "offer", prices: [{ currency: "USD" as const, amountMinor: 1999, isEnabled: true }] };
const base = {
  providers: [{ id: "lava-provider", provider: "lava" as const }],
  catalogItems: [{ providerId: "lava-provider", externalOfferId: "offer", isStale: false, isSelectable: true, prices: [{ currency: "USD" as const, amountMinor: 1999 }] }],
  amountRub: null
};

describe("product binding mutation orchestration", () => {
  it("rejects invalid binding prices before entering the replacement transaction", async () => {
    const transaction = vi.fn();
    const result = await runProductBindingMutation({
      ...base,
      bindings: [{ ...lava, prices: [{ currency: "USD", amountMinor: 0, isEnabled: true }] }],
      transaction
    });
    expect(result.ok).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("hands selected currencies to one atomic replacement callback", async () => {
    const transaction = vi.fn(async (bindings) => ({ bindings }));
    const result = await runProductBindingMutation({ ...base, bindings: [lava], transaction });
    expect(result).toEqual({ ok: true, value: { bindings: [lava] } });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("reconstructs a legacy RUB price when an update omits its unchanged Lava binding", async () => {
    const transaction = vi.fn(async (bindings) => bindings);
    const legacy = { ...lava, prices: [] };
    const result = await runProductBindingMutation({
      ...base,
      amountRub: 990,
      catalogItems: [{ ...base.catalogItems[0]!, prices: [{ currency: "RUB" as const, amountMinor: 99000 }] }],
      bindings: [legacy],
      existingBindings: [legacy],
      existingAmountRub: 990,
      transaction
    });
    expect(result).toEqual({ ok: true, value: [{ ...legacy, prices: [{ currency: "RUB", amountMinor: 99000, isEnabled: true }] }] });
  });

  it("rejects a changed editable legacy amount before entering the transaction", async () => {
    const transaction = vi.fn();
    const legacy = { ...lava, prices: [] };
    const result = await runProductBindingMutation({
      ...base, amountRub: 1200, bindings: [legacy], existingBindings: [legacy], existingAmountRub: 990, transaction
    });
    expect(result.ok).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a restored legacy RUB price when the current fixed catalog amount drifted", async () => {
    const transaction = vi.fn();
    const legacy = { ...lava, prices: [] };
    const result = await runProductBindingMutation({
      ...base,
      amountRub: 990,
      existingAmountRub: 990,
      bindings: [legacy],
      existingBindings: [legacy],
      catalogItems: [{ ...base.catalogItems[0]!, prices: [{ currency: "RUB" as const, amountMinor: 100000 }] }],
      transaction
    });
    expect(result.ok).toBe(false);
    expect(transaction).not.toHaveBeenCalled();
  });
});
