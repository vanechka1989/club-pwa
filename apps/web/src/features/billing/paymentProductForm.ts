import type { PaymentProductKind, PaymentProviderCatalogItem } from "@club/shared";

type PaymentProductFormBasics = {
  kind: PaymentProductKind;
  title: string;
  amountRub: number | null;
  accessDays: number;
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
  return {
    ...form,
    kind: item.kind,
    title: item.title,
    amountRub: item.amountRub ?? form.amountRub,
    accessDays: lavaCatalogAccessDays(item.periodicity ?? null) ?? form.accessDays
  };
}
