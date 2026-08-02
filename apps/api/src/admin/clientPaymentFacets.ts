import type { PaymentOrderStatus, PaymentProviderCode } from "@club/shared";

type ClientPaymentFacetRow = {
  userId: string;
  status: PaymentOrderStatus;
  productId: string | null;
  provider: PaymentProviderCode;
};

export type ClientPaymentFacets = {
  paymentProductIds: string[];
  paymentProviders: PaymentProviderCode[];
};

export function buildClientPaymentFacetMaps(rows: ClientPaymentFacetRow[]) {
  const working = new Map<string, { productIds: Set<string>; providers: Set<PaymentProviderCode> }>();

  for (const row of rows) {
    if (row.status !== "paid") continue;
    const facets = working.get(row.userId) ?? { productIds: new Set<string>(), providers: new Set<PaymentProviderCode>() };
    if (row.productId) facets.productIds.add(row.productId);
    facets.providers.add(row.provider);
    working.set(row.userId, facets);
  }

  return new Map<string, ClientPaymentFacets>(Array.from(working, ([userId, facets]) => [userId, {
    paymentProductIds: Array.from(facets.productIds).sort(),
    paymentProviders: Array.from(facets.providers).sort()
  }]));
}
