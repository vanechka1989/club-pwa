import type { PaymentCurrency, PaymentProductKind, PaymentProviderCode } from "@club/shared";
import { isLavaCatalogPriceForProduct } from "./lavaPeriodicity";

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
    prices: Array<{ currency: PaymentCurrency; amountMinor: number | null; periodicity?: string | null }>;
  },
  expected: { currency: PaymentCurrency; amountMinor: number },
  kind: PaymentProductKind = "one_time",
  accessDays: number | null = 30
) {
  if (catalogItem.isStale) return false;
  const catalogPrice = catalogItem.prices.find((price) =>
    price.currency === expected.currency && isLavaCatalogPriceForProduct(price.periodicity, kind, accessDays)
  );
  return catalogPrice !== undefined && (catalogPrice.amountMinor === null || catalogPrice.amountMinor === expected.amountMinor);
}

type CheckoutSnapshot = { currency: PaymentCurrency; amountMinor: number; amountRub: number | null };
type CheckoutOrder = { providerOrderId: string };
type AdapterCheckout = { checkoutUrl: string; externalOrderId: string | null };

function snapshotWithLegacyRub(money: { currency: PaymentCurrency; amountMinor: number }): CheckoutSnapshot {
  return {
    currency: money.currency,
    amountMinor: money.amountMinor,
    amountRub: money.currency === "RUB" && money.amountMinor % 100 === 0 ? money.amountMinor / 100 : null
  };
}

export async function createCheckoutWithSnapshot(input: {
  snapshot: { currency: PaymentCurrency; amountMinor: number };
  createOrder: (snapshot: CheckoutSnapshot) => Promise<CheckoutOrder | null>;
  createAdapterCheckout: (order: CheckoutOrder, snapshot: CheckoutSnapshot) => Promise<AdapterCheckout>;
  persistExternalOrderId: (order: CheckoutOrder, externalOrderId: string) => Promise<void>;
}) {
  const snapshot = snapshotWithLegacyRub(input.snapshot);
  const order = await input.createOrder(snapshot);
  if (!order) return null;
  const checkout = await input.createAdapterCheckout(order, snapshot);
  if (checkout.externalOrderId) await input.persistExternalOrderId(order, checkout.externalOrderId);
  return checkout;
}
