import type { PaymentCurrency, PaymentProviderCode } from "@club/shared";

export type ProductBindingPriceInput = {
  currency: PaymentCurrency;
  amountMinor: number;
  isEnabled: boolean;
};

export type ProductBindingInput = {
  provider: PaymentProviderCode;
  enabled: boolean;
  externalProductId: string | null;
  externalOfferId: string | null;
  prices: ProductBindingPriceInput[];
};

type Provider = { id: string; provider: PaymentProviderCode };
type CatalogItem = {
  providerId: string;
  externalOfferId: string;
  isStale: boolean;
  isSelectable: boolean;
  prices: Array<{ currency: PaymentCurrency; amountMinor: number | null }>;
};

type ExistingBinding = { provider: PaymentProviderCode; externalOfferId: string | null };

type PreparationInput = {
  bindings: ProductBindingInput[];
  providers: Provider[];
  catalogItems: CatalogItem[];
  existingBindings?: ExistingBinding[];
  legacyFallbackOffers?: string[];
  amountRub: number | null;
};

type PreparationResult =
  | { ok: true; bindings: ProductBindingInput[] }
  | { ok: false; error: string };

const supportedCurrencies = new Set<PaymentCurrency>(["RUB", "USD", "EUR"]);

function isAlreadyBound(binding: ProductBindingInput, existingBindings: ExistingBinding[]) {
  return existingBindings.some((existing) =>
    existing.provider === "lava" && existing.provider === binding.provider && existing.externalOfferId === binding.externalOfferId
  );
}

function validateLavaPrices(
  binding: ProductBindingInput,
  catalogItem: CatalogItem | undefined,
  existingBindings: ExistingBinding[],
  allowLegacyFallback: boolean
): string | null {
  if (!binding.externalOfferId) return "Для Lava выберите предложение.";
  if (!binding.prices.some((price) => price.isEnabled)) return "Для Lava выберите хотя бы одну валюту.";
  const currencies = new Set<PaymentCurrency>();
  for (const price of binding.prices) {
    if (!supportedCurrencies.has(price.currency) || !Number.isInteger(price.amountMinor) || price.amountMinor <= 0) {
      return "Укажите корректную цену Lava.";
    }
    if (currencies.has(price.currency)) return "Валюты Lava не должны повторяться.";
    currencies.add(price.currency);
  }

  const alreadyBound = isAlreadyBound(binding, existingBindings);
  if (allowLegacyFallback) return null;
  if (!catalogItem) {
    return alreadyBound ? null : "Выбранное предложение Lava не найдено.";
  }
  if ((catalogItem.isStale || !catalogItem.isSelectable) && !alreadyBound) {
    return "Выбранное предложение Lava сейчас недоступно.";
  }
  for (const price of binding.prices) {
    const catalogPrice = catalogItem.prices.find((entry) => entry.currency === price.currency);
    if (!catalogPrice) return "Выбранная валюта отсутствует в предложении Lava.";
    if (catalogPrice.amountMinor !== null && catalogPrice.amountMinor !== price.amountMinor) {
      return "Цена Lava изменилась. Обновите выбранные валюты.";
    }
  }
  return null;
}

export function prepareProductBindingPrices(input: PreparationInput): PreparationResult {
  const existingBindings = input.existingBindings ?? [];
  const providersByCode = new Map(input.providers.map((provider) => [provider.provider, provider]));
  const bindings: ProductBindingInput[] = [];

  for (const binding of input.bindings) {
    const provider = providersByCode.get(binding.provider);
    if (!provider) return { ok: false, error: "Сначала подключите выбранную платёжную систему." };
    if (binding.provider === "prodamus") {
      if (binding.prices.some((price) => price.currency !== "RUB")) {
        return { ok: false, error: "Prodamus поддерживает только цену в рублях." };
      }
      if (!binding.enabled) {
        bindings.push({ ...binding, prices: [] });
        continue;
      }
      if (input.amountRub === null || input.amountRub <= 0) return { ok: false, error: "Для Prodamus укажите цену в рублях." };
      bindings.push({
        ...binding,
        prices: [{ currency: "RUB", amountMinor: input.amountRub * 100, isEnabled: true }]
      });
      continue;
    }

    const catalogItem = binding.externalOfferId
      ? input.catalogItems.find((item) => item.providerId === provider.id && item.externalOfferId === binding.externalOfferId)
      : undefined;
    const error = validateLavaPrices(binding, catalogItem, existingBindings, input.legacyFallbackOffers?.includes(binding.externalOfferId ?? "") ?? false);
    if (error) return { ok: false, error };
    bindings.push({ ...binding, prices: binding.prices.map((price) => ({ ...price })) });
  }
  return { ok: true, bindings };
}
