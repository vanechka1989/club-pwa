import type { PaymentCurrency } from "@club/shared";
import type { NormalizedPaymentEvent, ProviderOrderStatusInput } from "./providerAdapter";

export type ReconciliationSummary = {
  checked: number;
  corrected: number;
  failed: number;
};

type PendingLavaOrder = {
  externalOrderId: string;
  productId: string;
  buyerEmail: string;
  currency: PaymentCurrency;
  amountMinor: number;
};

export async function reconcilePendingLavaOrders(input: {
  providerId: string;
  apiKey: string;
  orders: PendingLavaOrder[];
  getOrderStatus: (input: ProviderOrderStatusInput) => Promise<NormalizedPaymentEvent | null>;
  processEvent: (event: NormalizedPaymentEvent, providerId: string) => Promise<"processed" | "duplicate" | "ignored">;
}) {
  return runBoundedReconciliation(input.orders, async (order) => {
    const event = await input.getOrderStatus({
      credentials: { apiKey: input.apiKey },
      externalOrderId: order.externalOrderId,
      productId: order.productId,
      buyerEmail: order.buyerEmail,
      currency: order.currency,
      amountMinor: order.amountMinor
    });
    if (!event) return "unchanged";
    return (await input.processEvent(event, input.providerId)) === "processed" ? "corrected" : "unchanged";
  }, 4);
}

export async function runBoundedReconciliation<T>(
  items: T[],
  worker: (item: T) => Promise<"corrected" | "unchanged">,
  concurrency = 4
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = { checked: 0, corrected: 0, failed: 0 };
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) return;
      summary.checked += 1;
      try {
        if (await worker(item) === "corrected") summary.corrected += 1;
      } catch {
        summary.failed += 1;
      }
    }
  });
  await Promise.all(runners);
  return summary;
}
