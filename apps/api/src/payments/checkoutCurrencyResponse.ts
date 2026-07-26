import type { PaymentMoney, SubscribeResponse } from "@club/shared";

export function checkoutCurrencyChoiceResponse(currencyOptions: PaymentMoney[]): SubscribeResponse {
  return {
    checkoutUrl: null,
    message: "Выберите валюту оплаты.",
    currencyOptions
  };
}

export function checkoutPreflightChoiceResult(preflight: { kind: "choice"; options: PaymentMoney[] }) {
  return {
    status: 200 as const,
    body: checkoutCurrencyChoiceResponse(preflight.options)
  };
}
