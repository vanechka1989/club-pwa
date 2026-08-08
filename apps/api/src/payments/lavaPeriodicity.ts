import type { PaymentProductKind } from "@club/shared";

const periodicityByAccessDays = new Map<number, string>([
  [30, "MONTHLY"],
  [90, "PERIOD_90_DAYS"],
  [180, "PERIOD_180_DAYS"],
  [365, "PERIOD_YEAR"]
]);

export function lavaPeriodicityForProduct(kind: PaymentProductKind, accessDays: number | null) {
  if (kind === "one_time") return "ONE_TIME";
  if (accessDays === null) return null;
  return periodicityByAccessDays.get(accessDays) ?? null;
}

export function isLavaCatalogPriceForProduct(
  periodicity: string | null | undefined,
  kind: PaymentProductKind,
  accessDays: number | null
) {
  const expected = lavaPeriodicityForProduct(kind, accessDays);
  return expected !== null && (periodicity ?? "ONE_TIME") === expected;
}
