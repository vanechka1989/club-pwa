import type { PaymentProviderCode } from "@club/shared";

type PaymentBindingSelection = {
  provider: PaymentProviderCode;
  enabled: boolean;
};

export function validateSingleEnabledPaymentBinding(bindings: PaymentBindingSelection[]) {
  const enabled = bindings.filter((binding) => binding.enabled);
  if (enabled.length === 0) {
    return { ok: false as const, error: "Выберите одну платёжную систему." };
  }
  if (enabled.length > 1) {
    return {
      ok: false as const,
      error: "Для тарифа можно выбрать только одну платёжную систему."
    };
  }
  return { ok: true as const, provider: enabled[0]!.provider };
}
