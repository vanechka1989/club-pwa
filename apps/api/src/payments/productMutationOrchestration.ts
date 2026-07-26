import { prepareProductBindingPrices, type ProductBindingInput } from "./productBindingPrices";

type Input = Parameters<typeof prepareProductBindingPrices>[0];

function restoreLegacyPrices(bindings: ProductBindingInput[], existingBindings: ProductBindingInput[], amountRub: number | null) {
  if (typeof amountRub !== "number" || !Number.isInteger(amountRub) || amountRub <= 0) return { bindings, legacyFallbackOffers: [] as string[] };
  const legacyFallbackOffers: string[] = [];
  const restored = bindings.map((binding) => {
    const existing = existingBindings.find((item) => item.provider === binding.provider && item.externalOfferId === binding.externalOfferId);
    if (binding.provider !== "lava" || binding.prices.length || !existing || existing.prices.length || !binding.externalOfferId) return binding;
    legacyFallbackOffers.push(binding.externalOfferId);
    return { ...binding, prices: [{ currency: "RUB" as const, amountMinor: amountRub * 100, isEnabled: true }] };
  });
  return { bindings: restored, legacyFallbackOffers };
}

export async function runProductBindingMutation<T>(input: Input & {
  existingBindings?: ProductBindingInput[];
  transaction: (bindings: ProductBindingInput[]) => Promise<T>;
}) {
  const existingBindings = input.existingBindings ?? [];
  const restored = restoreLegacyPrices(input.bindings, existingBindings, input.amountRub);
  const prepared = prepareProductBindingPrices({
    ...input,
    bindings: restored.bindings,
    existingBindings: existingBindings.map(({ provider, externalOfferId }) => ({ provider, externalOfferId })),
    legacyFallbackOffers: restored.legacyFallbackOffers
  });
  if (!prepared.ok) return prepared;
  return { ok: true as const, value: await input.transaction(prepared.bindings) };
}
