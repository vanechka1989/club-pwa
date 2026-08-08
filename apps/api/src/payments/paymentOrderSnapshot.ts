import type { PaymentAccessType, PaymentProductKind } from "@club/shared";

type ProductSnapshotInput = {
  productId: string | null;
  individualOfferId: string | null;
  productTitleSnapshot: string | null;
  productKindSnapshot: PaymentProductKind | null;
  accessTypeSnapshot: PaymentAccessType | null;
  accessDaysSnapshot: number | null;
  product: {
    id: string;
    title: string;
    kind: PaymentProductKind;
    accessType: PaymentAccessType;
    accessDays: number | null;
  } | null;
};

export type ResolvedPaymentOrderSnapshot = {
  id: string;
  title: string;
  kind: PaymentProductKind;
  accessType: PaymentAccessType;
  accessDays: number | null;
  source: "product" | "offer";
};

export function resolvePaymentOrderSnapshot(input: ProductSnapshotInput): ResolvedPaymentOrderSnapshot {
  const snapshotId = input.productId ?? input.individualOfferId;
  if (
    snapshotId &&
    input.productTitleSnapshot &&
    input.productKindSnapshot &&
    input.accessTypeSnapshot &&
    ((input.accessTypeSnapshot === "limited" && input.accessDaysSnapshot !== null) ||
      (input.accessTypeSnapshot === "lifetime" && input.accessDaysSnapshot === null))
  ) {
    return {
      id: snapshotId,
      title: input.productTitleSnapshot,
      kind: input.productKindSnapshot,
      accessType: input.accessTypeSnapshot,
      accessDays: input.accessDaysSnapshot,
      source: input.productId ? "product" : "offer"
    };
  }
  if (input.productId && input.product) {
    return {
      id: input.product.id,
      title: input.product.title,
      kind: input.product.kind,
      accessType: input.product.accessType,
      accessDays: input.product.accessDays,
      source: "product"
    };
  }
  throw new Error("PAYMENT_ORDER_PRODUCT_SNAPSHOT_MISSING");
}
