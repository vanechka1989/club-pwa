import type { PaymentAccessType } from "@club/shared";

const dayMs = 24 * 60 * 60 * 1000;

export function getExtendedAccessExpiry(now: Date, currentExpiry: Date | null, accessDays: number) {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + accessDays * dayMs);
}

export function getPaidAccessExpiry(
  now: Date,
  currentExpiry: Date | null,
  accessType: PaymentAccessType,
  accessDays: number | null
) {
  if (accessType === "lifetime") return null;
  if (accessDays === null) throw new Error("PAYMENT_ACCESS_DAYS_MISSING");
  return getExtendedAccessExpiry(now, currentExpiry, accessDays);
}

export function isPaymentAmountValid(
  expected: { currency: string; amountMinor: number },
  actual: { currency: string; amountMinor: number }
) {
  return expected.currency === actual.currency && expected.amountMinor === actual.amountMinor;
}

export function getCompatibleLegacyRubAmount(input: {
  currency: string;
  amountMinor: number;
  amountRub: number | null;
}) {
  if (input.currency !== "RUB" || input.amountMinor % 100 !== 0) return null;
  const majorAmount = input.amountMinor / 100;
  return input.amountRub === majorAmount ? input.amountRub : null;
}
