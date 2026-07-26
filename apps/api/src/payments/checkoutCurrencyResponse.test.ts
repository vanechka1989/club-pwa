import { describe, expect, it } from "vitest";
import { subscribeResponseSchema } from "@club/shared";
import { checkoutCurrencyChoiceResponse } from "./checkoutCurrencyResponse";

describe("checkout currency choice response", () => {
  it("returns typed currencyOptions without overloading provider options", () => {
    const response = checkoutCurrencyChoiceResponse([{ currency: "USD", amountMinor: 1999 }]);

    expect(subscribeResponseSchema.parse(response).currencyOptions).toEqual([{ currency: "USD", amountMinor: 1999 }]);
    expect(response).not.toHaveProperty("options");
  });
});
