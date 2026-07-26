import type { PaymentProductKind, PaymentProductProviderBinding, PaymentProviderCatalogItem } from "@club/shared";

type PaymentProductFormBasics = {
  kind: PaymentProductKind;
  title: string;
  amountRub: number | null;
  accessDays: number;
  bindings?: PaymentProductProviderBinding[];
};

const lavaAccessDaysByPeriodicity = new Map<string, number>([
  ["MONTHLY", 30],
  ["PERIOD_90_DAYS", 90],
  ["PERIOD_180_DAYS", 180],
  ["PERIOD_YEAR", 365]
]);

export function lavaCatalogAccessDays(periodicity: string | null) {
  return periodicity ? lavaAccessDaysByPeriodicity.get(periodicity) ?? null : null;
}

export function applyLavaCatalogItem(
  form: PaymentProductFormBasics,
  item: PaymentProviderCatalogItem
): PaymentProductFormBasics {
  const hasForeignOnlyPrices = Boolean(item.prices?.length) && !item.prices?.some((price) => price.currency === "RUB");
  const fixedPrices = (item.prices ?? [])
    .filter((price): price is typeof price & { amountMinor: number } => price.amountMinor !== null)
    .map((price) => ({ currency: price.currency, amountMinor: price.amountMinor, isEnabled: true }));
  const bindings = form.bindings?.map((binding) =>
    binding.provider === "lava"
      ? { ...binding, externalProductId: item.externalProductId, externalOfferId: item.externalOfferId, prices: fixedPrices }
      : binding
  );
  return {
    ...form,
    kind: item.kind,
    title: item.title,
    amountRub: hasForeignOnlyPrices ? null : item.amountRub ?? form.amountRub,
    accessDays: lavaCatalogAccessDays(item.periodicity ?? null) ?? form.accessDays,
    ...(bindings ? { bindings } : {})
  };
}
