import { prepareProductBindingPrices, type ProductBindingInput } from "./productBindingPrices";

type Input = Parameters<typeof prepareProductBindingPrices>[0];

function restoreLegacyPrices(
  bindings: ProductBindingInput[],
  existingBindings: ProductBindingInput[],
  amountRub: number | null,
  existingAmountRub: number | null | undefined
) {
  const priorAmountRub = typeof existingAmountRub === "number" && Number.isInteger(existingAmountRub) && existingAmountRub > 0
    ? existingAmountRub
    : null;
  let error: string | null = null;
  const restored = bindings.map((binding) => {
    const existing = existingBindings.find((item) => item.provider === binding.provider && item.externalOfferId === binding.externalOfferId);
    if (binding.provider !== "lava" || binding.prices.length || !existing || existing.prices.length || !binding.externalOfferId) return binding;
    if (priorAmountRub === null || amountRub !== priorAmountRub) {
      error = "Для изменения цены Lava выберите явные валюты.";
      return binding;
    }
    return { ...binding, prices: [{ currency: "RUB" as const, amountMinor: priorAmountRub * 100, isEnabled: true }] };
  });
  return { bindings: restored, error };
}

export async function runProductBindingMutation<T>(input: Input & {
  existingBindings?: ProductBindingInput[];
  existingAmountRub?: number | null;
  transaction: (bindings: ProductBindingInput[]) => Promise<T>;
}) {
  const existingBindings = input.existingBindings ?? [];
  const restored = restoreLegacyPrices(input.bindings, existingBindings, input.amountRub, input.existingAmountRub);
  if (restored.error) return { ok: false as const, error: restored.error };
  const prepared = prepareProductBindingPrices({
    ...input,
    bindings: restored.bindings,
    existingBindings: existingBindings.map(({ provider, externalOfferId }) => ({ provider, externalOfferId }))
  });
  if (!prepared.ok) return prepared;
  return { ok: true as const, value: await input.transaction(prepared.bindings) };
}
