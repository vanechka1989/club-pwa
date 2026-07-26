import type { PaymentCurrency, PaymentProviderCode } from "@club/shared";

type BindingPrice = { currency: PaymentCurrency; amountMinor: number; isEnabled: boolean };
type Binding = {
  provider: { provider: string };
  isEnabled: boolean;
  externalProductId: string | null;
  externalOfferId: string | null;
  prices: BindingPrice[];
};

type Product = {
  id: string;
  providerId: string;
  kind: "one_time" | "recurrent";
  title: string;
  description: string | null;
  badgeLabel: string | null;
  amountRub: number | null;
  accessDays: number;
  prodamusSubscriptionId: string | null;
  isPublished: boolean;
  archivedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  providerBindings?: Binding[];
};

export function mapPaymentProduct(product: Product) {
  const bindingPrices = (binding: Binding) => {
    if (binding.prices.length) {
      return binding.prices.map((price) => ({
        currency: price.currency,
        amountMinor: price.amountMinor,
        enabled: price.isEnabled
      }));
    }
    if (product.amountRub !== null && (binding.provider.provider === "prodamus" || binding.provider.provider === "lava")) {
      return [{ currency: "RUB" as const, amountMinor: product.amountRub * 100, enabled: true }];
    }
    return [];
  };
  const bindings = (product.providerBindings ?? []).map((binding) => ({
    provider: binding.provider.provider as PaymentProviderCode,
    enabled: binding.isEnabled,
    externalProductId: binding.externalProductId,
    externalOfferId: binding.externalOfferId,
    prices: bindingPrices(binding)
  }));
  const activeBinding = bindings.find((binding) => binding.enabled);
  return {
    id: product.id,
    providerId: product.providerId,
    kind: product.kind,
    title: product.title,
    description: product.description,
    badgeLabel: product.badgeLabel,
    amountRub: product.amountRub,
    prices: (activeBinding?.prices ?? []).filter((price) => price.enabled).map(({ currency, amountMinor }) => ({ currency, amountMinor })),
    accessDays: product.accessDays,
    prodamusSubscriptionId: product.prodamusSubscriptionId,
    bindings,
    isPublished: product.isPublished,
    archivedUntil: product.archivedUntil?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString()
  };
}
