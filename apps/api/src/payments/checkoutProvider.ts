import type { PaymentCheckoutOption, PaymentProviderCode } from "@club/shared";

type CheckoutBinding = PaymentCheckoutOption & { enabled: boolean };

export type CheckoutProviderResolution =
  | { kind: "selected"; provider: PaymentProviderCode }
  | { kind: "choice"; options: PaymentCheckoutOption[] }
  | { kind: "unavailable" };

export function resolveCheckoutProvider(
  bindings: CheckoutBinding[],
  requested: PaymentProviderCode | undefined
): CheckoutProviderResolution {
  const enabled = bindings.filter((binding) => binding.enabled);
  if (requested) {
    return enabled.some((binding) => binding.provider === requested)
      ? { kind: "selected", provider: requested }
      : { kind: "unavailable" };
  }
  if (enabled.length === 1) {
    return { kind: "selected", provider: enabled[0]!.provider };
  }
  if (enabled.length > 1) {
    return {
      kind: "choice",
      options: enabled.map(({ provider, title }) => ({ provider, title }))
    };
  }
  return { kind: "unavailable" };
}
