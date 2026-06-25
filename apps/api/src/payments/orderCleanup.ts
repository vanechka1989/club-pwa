export const pendingPaymentOrderTtlMs = 60 * 60 * 1000;
export const pendingPaymentOrderCleanupIntervalMs = 10 * 60 * 1000;

export function getExpiredPendingPaymentOrderCutoff(now = new Date()) {
  return new Date(now.getTime() - pendingPaymentOrderTtlMs);
}
