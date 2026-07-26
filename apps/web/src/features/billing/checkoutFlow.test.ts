import { describe, expect, it, vi } from "vitest";
import { startConfirmedCheckout, startCurrencyChoiceCheckout } from "./checkoutFlow";

describe("payment checkout flow", () => {
  it("does not call the checkout client when the currency picker is cancelled", async () => {
    const confirmRedirect = vi.fn(async () => true);
    const createCheckout = vi.fn(async () => undefined);

    await startCurrencyChoiceCheckout({ provider: "lava", currency: undefined, confirmRedirect, createCheckout });

    expect(confirmRedirect).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("confirms a single-currency redirect before making one checkout call", async () => {
    const calls: string[] = [];

    await startConfirmedCheckout({
      provider: undefined,
      currency: "USD",
      confirmRedirect: async () => {
        calls.push("confirm");
        return true;
      },
      createCheckout: async (provider, currency) => {
        calls.push(`checkout:${provider ?? "default"}:${currency ?? "none"}`);
      }
    });

    expect(calls).toEqual(["confirm", "checkout:default:USD"]);
  });
});
