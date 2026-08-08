import type { PaymentAccessType, PaymentProductKind, PaymentProductProviderBinding, PaymentProviderCatalogItem } from "@club/shared";

type PaymentProductFormBasics = {
  kind: PaymentProductKind;
  title: string;
  amountRub: number | null;
  accessType: PaymentAccessType;
  accessDays: number | null;
  bindings?: PaymentProductProviderBinding[];
};

const lavaPeriods = [
  { periodicity: "MONTHLY", accessDays: 30, label: "1 месяц" },
  { periodicity: "PERIOD_90_DAYS", accessDays: 90, label: "3 месяца" },
  { periodicity: "PERIOD_180_DAYS", accessDays: 180, label: "6 месяцев" },
  { periodicity: "PERIOD_YEAR", accessDays: 365, label: "1 год" }
] as const;
const lavaAccessDaysByPeriodicity = new Map<string, number>(
  lavaPeriods.map(({ periodicity, accessDays }) => [periodicity, accessDays])
);
const lavaPeriodicityByAccessDays = new Map<number, string>(
  Array.from(lavaAccessDaysByPeriodicity, ([periodicity, accessDays]) => [accessDays, periodicity])
);

export function lavaCatalogAccessDays(periodicity: string | null) {
  return periodicity ? lavaAccessDaysByPeriodicity.get(periodicity) ?? null : null;
}

export function normalizePaymentAccess(
  kind: PaymentProductKind,
  accessType: PaymentAccessType,
  accessDays: number | null
) {
  if (kind === "recurrent") return { accessType: "limited" as const, accessDays: accessDays ?? 30 };
  if (accessType === "lifetime") return { accessType, accessDays: null };
  return { accessType, accessDays: accessDays ?? 30 };
}

export function paymentAccessLabel(accessType: PaymentAccessType, accessDays: number | null) {
  if (accessType === "lifetime") return "Постоянный доступ";
  const days = accessDays ?? 0;
  const mod10 = days % 10;
  const mod100 = days % 100;
  const unit = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дня" : "дней";
  return `${days} ${unit}`;
}

export function lavaPeriodicityForTariff(kind: PaymentProductKind, accessDays: number | null) {
  if (kind === "one_time") return "ONE_TIME";
  if (accessDays === null) return null;
  return lavaPeriodicityByAccessDays.get(accessDays) ?? null;
}

export function lavaCatalogPeriodLabel(periodicity: string | null | undefined) {
  if (!periodicity || periodicity === "ONE_TIME") return "Разовая оплата";
  return lavaPeriods.find((period) => period.periodicity === periodicity)?.label ?? periodicity;
}

export function lavaCatalogPeriodOptions(item: PaymentProviderCatalogItem) {
  if (item.kind !== "recurrent") return [];
  const available = new Set(
    (item.prices?.length ? item.prices.map((price) => price.periodicity) : [item.periodicity])
      .filter((periodicity): periodicity is string => Boolean(periodicity))
  );
  return lavaPeriods.filter((period) => available.has(period.periodicity));
}

export function lavaCatalogPricesForTariff(
  item: PaymentProviderCatalogItem,
  kind: PaymentProductKind,
  accessDays: number | null
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
  const periods = lavaCatalogPeriodOptions(item);
  const accessDays = periods.find((period) => period.accessDays === form.accessDays)?.accessDays
    ?? periods.find((period) => period.periodicity === item.periodicity)?.accessDays
    ?? periods[0]?.accessDays
    ?? lavaCatalogAccessDays(item.periodicity ?? null)
    ?? form.accessDays;
  const access = normalizePaymentAccess(item.kind, form.accessType, accessDays);
  const catalogPrices = lavaCatalogPricesForTariff(item, item.kind, access.accessDays);
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
    ...access,
    ...(bindings ? { bindings } : {})
  };
}
