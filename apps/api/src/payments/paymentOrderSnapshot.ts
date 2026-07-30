import type { PaymentProductKind } from "@club/shared";

type ProductSnapshotInput = {
  productId: string | null;
  individualOfferId: string | null;
  productTitleSnapshot: string | null;
  productKindSnapshot: PaymentProductKind | null;
  accessDaysSnapshot: number | null;
  product: {
    id: string;
    title: string;
    kind: PaymentProductKind;
    accessDays: number;
  } | null;
};

export type ResolvedPaymentOrderSnapshot = {
  id: string;
  title: string;
  kind: PaymentProductKind;
  accessDays: number;
  source: "product" | "offer";
};

export function resolvePaymentOrderSnapshot(input: ProductSnapshotInput): ResolvedPaymentOrderSnapshot {
  if (input.productId && input.product) {
    return {
      id: input.product.id,
      title: input.product.title,
      kind: input.product.kind,
      accessDays: input.product.accessDays,
      source: "product"
    };
  }
  if (
    input.individualOfferId &&
    input.productTitleSnapshot &&
    input.productKindSnapshot &&
    input.accessDaysSnapshot
  ) {
    return {
      id: input.individualOfferId,
      title: input.productTitleSnapshot,
      kind: input.productKindSnapshot,
      accessDays: input.accessDaysSnapshot,
      source: "offer"
    };
  }
  throw new Error("PAYMENT_ORDER_PRODUCT_SNAPSHOT_MISSING");
}
