type PaymentStatusRecord = {
  status: string;
};

export function getLatestPaidOrder<T extends PaymentStatusRecord>(orders: readonly T[]): T | null {
  return orders.find((order) => order.status === "paid") ?? null;
}
