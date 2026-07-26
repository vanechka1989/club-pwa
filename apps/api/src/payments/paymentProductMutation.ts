import type { PaymentProviderCode } from "@club/shared";

export function paymentProductMutationError(
  amountRub: number | null,
  bindings: Array<{ provider: PaymentProviderCode; enabled: boolean }>
) {
  return amountRub === null && bindings.some((binding) => binding.enabled && binding.provider === "prodamus")
    ? "Для Prodamus укажите цену в рублях."
    : null;
}
