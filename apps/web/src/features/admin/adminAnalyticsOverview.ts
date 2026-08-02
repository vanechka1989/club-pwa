export function paymentSuccessPercent(paidOrders: number, pendingOrders: number, failedOrders: number) {
  const paid = Math.max(0, paidOrders);
  const total = paid + Math.max(0, pendingOrders) + Math.max(0, failedOrders);
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((paid / total) * 100)));
}
