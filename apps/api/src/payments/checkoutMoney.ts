import type { PaymentCurrency, PaymentProviderCode } from "@club/shared";

type CheckoutPrice = {
  currency: PaymentCurrency;
  amountMinor: number;
  isEnabled: boolean;
};

export type CheckoutMoneyResolution =
  | { kind: "selected"; currency: PaymentCurrency; amountMinor: number }
  | { kind: "choice"; options: Array<{ currency: PaymentCurrency; amountMinor: number }> }
  | { kind: "unavailable" };

export function resolveCheckoutMoney(
  prices: CheckoutPrice[],
  requested: PaymentCurrency | undefined,
  provider: PaymentProviderCode
): CheckoutMoneyResolution {
  const enabled = prices.filter((price) => price.isEnabled && (provider !== "prodamus" || price.currency === "RUB"));
  if (requested) {
    const price = enabled.find((entry) => entry.currency === requested);
    return price ? { kind: "selected", currency: price.currency, amountMinor: price.amountMinor } : { kind: "unavailable" };
  }
  if (enabled.length === 1) {
    const price = enabled[0]!;
    return { kind: "selected", currency: price.currency, amountMinor: price.amountMinor };
  }
  return enabled.length > 1
    ? { kind: "choice", options: enabled.map(({ currency, amountMinor }) => ({ currency, amountMinor })) }
    : { kind: "unavailable" };
}

export function isLavaCatalogPriceCurrent(
  catalogItem: {
    isStale: boolean;
    prices: Array<{ currency: PaymentCurrency; amountMinor: number | null }>;
  },
  expected: { currency: PaymentCurrency; amountMinor: number }
) {
  if (catalogItem.isStale) return false;
  const catalogPrice = catalogItem.prices.find((price) => price.currency === expected.currency);
  return catalogPrice !== undefined && (catalogPrice.amountMinor === null || catalogPrice.amountMinor === expected.amountMinor);
}
