import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import PaymentCurrencyPicker from "./PaymentCurrencyPicker.vue";

describe("PaymentCurrencyPicker", () => {
  it("shows every configured currency and emits the selected one", async () => {
    const view = render(PaymentCurrencyPicker, {
      props: {
        options: [
          { currency: "RUB", amountMinor: 99000 },
          { currency: "USD", amountMinor: 1999 },
          { currency: "EUR", amountMinor: 1750 }
        ]
      }
    });

    expect(screen.getByRole("group", { name: "Валюта оплаты" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /19,99.*USD/i })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: /19,99.*USD/i }));
    expect(view.emitted("select")).toEqual([["USD"]]);
  });
});
