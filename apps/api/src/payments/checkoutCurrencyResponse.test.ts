import { describe, expect, it } from "vitest";
import { subscribeResponseSchema } from "@club/shared";
import { checkoutCurrencyChoiceResponse, checkoutPreflightChoiceResponse } from "./checkoutCurrencyResponse";
import { runCheckoutPreflight } from "./checkoutOrchestration";

describe("checkout currency choice response", () => {
  it("returns typed currencyOptions without overloading provider options", () => {
    const response = checkoutCurrencyChoiceResponse([{ currency: "USD", amountMinor: 1999 }]);

    expect(subscribeResponseSchema.parse(response).currencyOptions).toEqual([{ currency: "USD", amountMinor: 1999 }]);
    expect(response).not.toHaveProperty("options");
  });

  it("keeps a preflight currency choice in the typed currency response contract", async () => {
    const preflight = await runCheckoutPreflight({
      provider: "lava",
      requestedCurrency: undefined,
      prices: [
        { currency: "USD", amountMinor: 1999, isEnabled: true },
        { currency: "EUR", amountMinor: 1750, isEnabled: true }
      ],
      amountRub: null,
      catalogItem: null,
      createOrder: async () => ({ checkoutUrl: "https://checkout.example" })
    });
    if (preflight.kind !== "choice") throw new Error("Expected a currency choice");

    const response = checkoutPreflightChoiceResponse(preflight);
    expect(response).not.toHaveProperty("options");
    expect(response.currencyOptions).toEqual([
      { currency: "USD", amountMinor: 1999 },
      { currency: "EUR", amountMinor: 1750 }
    ]);
  });
});
