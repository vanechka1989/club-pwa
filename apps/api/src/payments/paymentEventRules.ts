const dayMs = 24 * 60 * 60 * 1000;

export function getExtendedAccessExpiry(now: Date, currentExpiry: Date | null, accessDays: number) {
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  return new Date(base.getTime() + accessDays * dayMs);
}

export function isPaymentAmountValid(expectedRub: number, actual: number, currency: string) {
  return currency === "RUB" && Math.abs(expectedRub - actual) < 0.01;
}
