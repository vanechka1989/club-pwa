import { buildProdamusPaymentUrl } from "./prodamus";
import type { PaymentProviderAdapter } from "./providerAdapter";

function requireCredential(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Prodamus ${name} is not configured`);
  }
  return value;
}

export const prodamusAdapter: PaymentProviderAdapter = {
  code: "prodamus",

  async createCheckout(input) {
    const checkoutUrl = buildProdamusPaymentUrl({
      formUrl: requireCredential(input.credentials.formUrl, "form URL"),
      secretKey: requireCredential(input.credentials.secretKey, "secret key"),
      sys: input.credentials.sys || input.user.telegramId,
      orderId: input.orderId,
      userTelegramId: input.user.telegramId,
      product: {
        title: input.product.title,
        amountRub: input.product.amountRub,
        kind: input.product.kind,
        accessDays: input.product.accessDays,
        prodamusSubscriptionId: input.product.externalProductId
      },
      returnUrl: input.returnUrl,
      notificationUrl: input.notificationUrl
    });

    return { checkoutUrl, externalOrderId: null };
  },

  async checkConnection(credentials) {
    const formUrl = requireCredential(credentials.formUrl, "form URL");
    const url = new URL(formUrl);
    if (url.protocol !== "https:") {
      throw new Error("Prodamus form URL must use HTTPS");
    }
    requireCredential(credentials.secretKey, "secret key");
  },

  async listCatalog() {
    return [];
  }
};
