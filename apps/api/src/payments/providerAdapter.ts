import type { PaymentCurrency, PaymentProductKind, PaymentProviderCode } from "@club/shared";

export type PaymentProviderCredentials = {
  formUrl?: string | undefined;
  secretKey?: string | undefined;
  sys?: string | undefined;
  apiKey?: string | undefined;
  webhookSecret?: string | undefined;
};

export type ProviderCheckoutInput = {
  credentials: PaymentProviderCredentials;
  orderId: string;
  user: {
    id: string;
    telegramId: string;
    email: string | null;
  };
  product: {
    title: string;
    amountRub: number | null;
    currency?: PaymentCurrency;
    amountMinor?: number;
    useCustomAmount?: boolean;
    kind: PaymentProductKind;
    accessDays: number;
    externalProductId: string | null;
    externalOfferId: string | null;
  };
  returnUrl: string;
  notificationUrl: string;
  expiresAt?: Date;
};

export type ProviderCatalogItem = {
  externalProductId: string;
  externalOfferId: string | null;
  title: string;
  kind: PaymentProductKind;
  amountRub: number | null;
  prices: Array<{
    currency: PaymentCurrency;
    amountMinor: number | null;
    periodicity: string | null;
  }>;
  metadata: Record<string, unknown>;
};

export type ProviderSubscriptionInput = {
  credentials: PaymentProviderCredentials;
  externalSubscriptionId: string;
  customerEmail: string;
};

export type ProviderOrderStatusInput = {
  credentials: PaymentProviderCredentials;
  externalOrderId: string;
  productId: string;
  buyerEmail: string;
  currency: PaymentCurrency;
  amountMinor: number;
};

export type ProviderOrderLookupInput = {
  credentials: PaymentProviderCredentials;
  merchantOrderId: string;
  createdAt: Date;
  buyerEmail?: string;
};

export type ProviderSubscriptionStatusInput = Omit<ProviderOrderStatusInput, "externalOrderId" | "currency" | "amountMinor"> & {
  externalSubscriptionId: string;
};

export type NormalizedPaymentEvent = {
  eventKey: string;
  provider: PaymentProviderCode;
  type:
    | "payment_succeeded"
    | "payment_failed"
    | "renewal_succeeded"
    | "renewal_failed"
    | "subscription_cancelled";
  externalOrderId: string;
  merchantOrderId?: string | null;
  externalPaymentId: string;
  externalSubscriptionId: string | null;
  productId: string;
  buyerEmail: string;
  amountMinor: number;
  currency: PaymentCurrency;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export interface PaymentProviderAdapter {
  readonly code: PaymentProviderCode;
  createCheckout(input: ProviderCheckoutInput): Promise<{
    checkoutUrl: string;
    externalOrderId: string | null;
  }>;
  checkConnection(credentials: PaymentProviderCredentials): Promise<void>;
  listCatalog(credentials: PaymentProviderCredentials): Promise<ProviderCatalogItem[]>;
  getOrderStatus?(input: ProviderOrderStatusInput): Promise<NormalizedPaymentEvent | null>;
  findExternalOrderId?(input: ProviderOrderLookupInput): Promise<string | null>;
  getSubscriptionEvents?(input: ProviderSubscriptionStatusInput): Promise<NormalizedPaymentEvent[]>;
  cancelSubscription?(input: ProviderSubscriptionInput): Promise<void>;
}
