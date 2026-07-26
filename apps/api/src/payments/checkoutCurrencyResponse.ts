import type { PaymentMoney, SubscribeResponse } from "@club/shared";

export function checkoutCurrencyChoiceResponse(currencyOptions: PaymentMoney[]): SubscribeResponse {
  return {
    checkoutUrl: null,
    message: "Выберите валюту оплаты.",
    currencyOptions
  };
}

export function checkoutPreflightChoiceResponse(preflight: { kind: "choice"; options: PaymentMoney[] }): SubscribeResponse {
  return checkoutCurrencyChoiceResponse(preflight.options);
}
