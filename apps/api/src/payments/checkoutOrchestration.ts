import type { PaymentCurrency, PaymentProviderCode } from "@club/shared";
import { isLavaCatalogPriceCurrent, resolveCheckoutMoney } from "./checkoutMoney";

type Price = { currency: PaymentCurrency; amountMinor: number; isEnabled: boolean };
type CatalogItem = { isStale: boolean; prices: Array<{ currency: PaymentCurrency; amountMinor: number | null }> } | null;

function effectivePrices(prices: Price[], amountRub: number | null) {
  if (prices.length || typeof amountRub !== "number" || !Number.isInteger(amountRub) || amountRub <= 0) return prices;
  return [{ currency: "RUB" as const, amountMinor: amountRub * 100, isEnabled: true }];
}

export async function runCheckoutPreflight<T>(input: {
  provider: PaymentProviderCode;
  requestedCurrency: PaymentCurrency | undefined;
  prices: Price[];
  amountRub: number | null;
  catalogItem: CatalogItem;
  createOrder: (money: { currency: PaymentCurrency; amountMinor: number }) => Promise<T>;
}) {
  const money = resolveCheckoutMoney(effectivePrices(input.prices, input.amountRub), input.requestedCurrency, input.provider);
  if (money.kind !== "selected") return money;
  if (input.provider === "lava" && input.catalogItem && !isLavaCatalogPriceCurrent(input.catalogItem, money)) {
    return { kind: "drift" as const };
  }
  return { kind: "created" as const, value: await input.createOrder({ currency: money.currency, amountMinor: money.amountMinor }) };
}
