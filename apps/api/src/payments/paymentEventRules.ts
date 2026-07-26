const dayMs = 24 * 60 * 60 * 1000;

export function getExtendedAccessExpiry(now: Date, currentExpiry: Date | null, accessDays: number) {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + accessDays * dayMs);
}

export function isPaymentAmountValid(
  expected: { currency: string; amountMinor: number },
  actual: { currency: string; amountMinor: number }
) {
  return expected.currency === actual.currency && expected.amountMinor === actual.amountMinor;
}
