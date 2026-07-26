import { buildProdamusPaymentUrl } from "./prodamus";
import type { PaymentProviderAdapter } from "./providerAdapter";
import { majorToMinor, minorToMajor, PaymentMoneyError } from "./money";

function requireCredential(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Prodamus ${name} is not configured`);
  }
  return value;
}

export const prodamusAdapter: PaymentProviderAdapter = {
  code: "prodamus",

  async createCheckout(input) {
    if (input.product.amountMinor !== undefined && input.product.currency !== "RUB") {
      throw new Error("Prodamus requires an explicit RUB snapshot");
    }
    if (input.product.currency && input.product.currency !== "RUB") {
      throw new Error("Prodamus supports RUB only");
    }
    let amountRub: number;
    try {
      amountRub = input.product.amountMinor === undefined
        ? minorToMajor(majorToMinor(input.product.amountRub ?? ""))
        : minorToMajor(input.product.amountMinor);
    } catch (error) {
      if (error instanceof PaymentMoneyError) throw new Error("Prodamus requires a valid RUB amount");
      throw error;
    }
    const checkoutUrl = buildProdamusPaymentUrl({
      formUrl: requireCredential(input.credentials.formUrl, "form URL"),
      secretKey: requireCredential(input.credentials.secretKey, "secret key"),
      sys: input.credentials.sys || input.user.telegramId,
      orderId: input.orderId,
      userTelegramId: input.user.telegramId,
      product: {
        title: input.product.title,
        amountRub,
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
