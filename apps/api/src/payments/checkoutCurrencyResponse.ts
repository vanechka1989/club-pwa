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

export function checkoutFailureResponse(error: unknown) {
  if (error instanceof Error && error.message === "LAVA_BUYER_EMAIL_REJECTED") {
    return {
      status: 400 as const,
      body: {
        checkoutUrl: null,
        message: "Почта владельца Lava не может использоваться для покупки собственного товара. Войдите с другой почтой."
      }
    };
  }
  return {
    status: 502 as const,
    body: { checkoutUrl: null, message: "Не удалось открыть оплату. Попробуйте ещё раз." }
  };
}
