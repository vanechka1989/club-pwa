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
const lavaPeriodicityByAccessDays = new Map<number, string>(
  Array.from(lavaAccessDaysByPeriodicity, ([periodicity, accessDays]) => [accessDays, periodicity])
);

export function lavaCatalogAccessDays(periodicity: string | null) {
  return periodicity ? lavaAccessDaysByPeriodicity.get(periodicity) ?? null : null;
}

export function lavaPeriodicityForTariff(kind: PaymentProductKind, accessDays: number) {
  if (kind === "one_time") return "ONE_TIME";
  return lavaPeriodicityByAccessDays.get(accessDays) ?? null;
}

export function lavaCatalogPricesForTariff(
  item: PaymentProviderCatalogItem,
  kind: PaymentProductKind,
  accessDays: number
) {
  const periodicity = lavaPeriodicityForTariff(kind, accessDays);
  if (!periodicity) return [];
  return (item.prices ?? []).filter((price) => {
    const pricePeriodicity = price.periodicity ?? "ONE_TIME";
    return pricePeriodicity === periodicity;
  });
}

export function applyLavaCatalogItem(
  form: PaymentProductFormBasics,
  item: PaymentProviderCatalogItem
): PaymentProductFormBasics {
  const accessDays = lavaCatalogAccessDays(item.periodicity ?? null) ?? form.accessDays;
  const catalogPrices = lavaCatalogPricesForTariff(item, item.kind, accessDays);
  const hasForeignOnlyPrices = Boolean(catalogPrices.length) && !catalogPrices.some((price) => price.currency === "RUB");
  const fixedPrices = catalogPrices
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
    accessDays,
    ...(bindings ? { bindings } : {})
  };
}
