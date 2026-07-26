import type { PaymentMoney, PaymentProduct } from "@club/shared";

export function productCurrencyOptions(product: Pick<PaymentProduct, "prices" | "amountRub">): PaymentMoney[] {
  if (product.prices?.length) return product.prices;
  return typeof product.amountRub === "number"
    ? [{ currency: "RUB", amountMinor: product.amountRub * 100 }]
    : [];
}
