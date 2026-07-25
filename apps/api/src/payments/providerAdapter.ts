import type { PaymentProductKind, PaymentProviderCode } from "@club/shared";

export type PaymentProviderCredentials = {
  formUrl?: string;
  secretKey?: string;
  sys?: string;
  apiKey?: string;
  webhookSecret?: string;
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
    amountRub: number;
    kind: PaymentProductKind;
    accessDays: number;
    externalProductId: string | null;
    externalOfferId: string | null;
  };
  returnUrl: string;
  notificationUrl: string;
};

export type ProviderCatalogItem = {
  externalProductId: string;
  externalOfferId: string | null;
  title: string;
  kind: PaymentProductKind;
  amountRub: number | null;
  metadata: Record<string, unknown>;
};

export type ProviderSubscriptionInput = {
  credentials: PaymentProviderCredentials;
  externalSubscriptionId: string;
  customerEmail: string;
};

export interface PaymentProviderAdapter {
  readonly code: PaymentProviderCode;
  createCheckout(input: ProviderCheckoutInput): Promise<{
    checkoutUrl: string;
    externalOrderId: string | null;
  }>;
  checkConnection(credentials: PaymentProviderCredentials): Promise<void>;
  listCatalog(credentials: PaymentProviderCredentials): Promise<ProviderCatalogItem[]>;
  cancelSubscription?(input: ProviderSubscriptionInput): Promise<void>;
}
