export type PaymentWatchState = {
  startedAt: string;
};

export type PaymentWatchOrder = {
  createdAt: string;
};

export const paymentWatchStorageKey = "club-payment-watch";

function getPaymentWatchStorage() {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function startPaymentWatch(date = new Date()) {
  getPaymentWatchStorage()?.setItem(paymentWatchStorageKey, JSON.stringify({ startedAt: date.toISOString() }));
}

export function readPaymentWatch(): PaymentWatchState | null {
  const raw = getPaymentWatchStorage()?.getItem(paymentWatchStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as PaymentWatchState;
    return typeof parsed.startedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPaymentWatch() {
  getPaymentWatchStorage()?.removeItem(paymentWatchStorageKey);
}

export function isOrderWithinPaymentWatch(order: PaymentWatchOrder, watch: PaymentWatchState, skewMs = 60_000) {
  return Date.parse(order.createdAt) >= Date.parse(watch.startedAt) - skewMs;
}
