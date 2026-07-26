import type { PaymentCurrency, PaymentProviderCode } from "@club/shared";

type CheckoutFlowInput<T> = {
  provider: PaymentProviderCode | undefined;
  currency: PaymentCurrency | undefined;
  confirmRedirect: () => Promise<boolean>;
  createCheckout: (provider: PaymentProviderCode | undefined, currency: PaymentCurrency | undefined) => Promise<T>;
};

export async function startConfirmedCheckout<T>(input: CheckoutFlowInput<T>) {
  if (!await input.confirmRedirect()) return false;
  await input.createCheckout(input.provider, input.currency);
  return true;
}

export async function startCurrencyChoiceCheckout<T>(input: CheckoutFlowInput<T>) {
  if (!input.currency) return false;
  return startConfirmedCheckout(input);
}
