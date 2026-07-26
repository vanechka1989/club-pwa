import type { PaymentCurrency, PaymentMoney, PaymentProduct, PaymentProviderCode } from "@club/shared";

export function productCurrencyOptions(product: Pick<PaymentProduct, "prices" | "amountRub">): PaymentMoney[] {
  if (product.prices?.length) return product.prices;
  return typeof product.amountRub === "number"
    ? [{ currency: "RUB", amountMinor: product.amountRub * 100 }]
    : [];
}

export type ProductCheckoutAction =
  | { kind: "choose_currency"; currencyOptions: PaymentMoney[] }
  | { kind: "confirm"; currency: PaymentCurrency | undefined };

export function productCheckoutAction(product: Pick<PaymentProduct, "prices" | "amountRub">): ProductCheckoutAction {
  const currencyOptions = productCurrencyOptions(product);
  return currencyOptions.length > 1
    ? { kind: "choose_currency", currencyOptions }
    : { kind: "confirm", currency: currencyOptions[0]?.currency };
}

export function retryCheckoutForCurrency(provider: PaymentProviderCode | undefined, currency?: PaymentCurrency) {
  return currency ? { provider, currency } : null;
}

export function serverCurrencyPickerAction(
  product: Pick<PaymentProduct, "id">,
  provider: PaymentProviderCode | undefined,
  response: { currencyOptions?: PaymentMoney[] | undefined }
) {
  if (!response.currencyOptions?.length) return null;
  return {
    kind: "choose_currency" as const,
    productId: product.id,
    provider,
    currencyOptions: response.currencyOptions
  };
}
