import type { PaymentCurrency, PaymentProductKind } from "@club/shared";

type StoredCatalogPrice = {
  currency: PaymentCurrency;
  amountMinor: number | null;
  periodicity: string | null;
};

type StoredCatalogItem = {
  id: string;
  externalProductId: string;
  externalOfferId: string;
  title: string;
  kind: PaymentProductKind;
  amountRub: number | null;
  metadata: Record<string, unknown> | null;
  isStale: boolean;
  isSelectable: boolean;
  syncedAt: Date;
  prices: StoredCatalogPrice[];
};

export function mapLavaCatalogItem(item: StoredCatalogItem) {
  return {
    id: item.id,
    externalProductId: item.externalProductId,
    externalOfferId: item.externalOfferId || null,
    title: item.title,
    kind: item.kind,
    amountRub: item.amountRub,
    periodicity: typeof item.metadata?.periodicity === "string" ? item.metadata.periodicity : null,
    prices: item.prices.map((price) => ({
      currency: price.currency,
      amountMinor: price.amountMinor,
      periodicity: price.periodicity
    })),
    isStale: item.isStale,
    isSelectable: item.isSelectable,
    syncedAt: item.syncedAt.toISOString()
  };
}
