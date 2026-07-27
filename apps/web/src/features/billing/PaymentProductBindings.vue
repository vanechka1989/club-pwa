<script setup lang="ts">
import type {
  PaymentCurrency,
  PaymentProductKind,
  PaymentProductProviderBinding,
  PaymentProviderCatalogItem,
  PaymentProviderCode
} from "@club/shared";
import { computed, watch } from "vue";
import { formatPaymentMoney } from "./paymentMoney";
import { lavaCatalogAccessDays, lavaCatalogPeriodOptions, lavaCatalogPricesForTariff } from "./paymentProductForm";

const props = withDefaults(defineProps<{
  modelValue: PaymentProductProviderBinding[];
  kind: PaymentProductKind;
  accessDays?: number;
  lavaCatalog: PaymentProviderCatalogItem[];
}>(), { accessDays: 30 });
const emit = defineEmits<{
  "update:modelValue": [bindings: PaymentProductProviderBinding[]];
  "lava-item-selected": [item: PaymentProviderCatalogItem];
  "lava-period-selected": [accessDays: number];
}>();
const selectedProvider = computed<PaymentProviderCode>(() =>
  props.modelValue.find((entry) => entry.enabled)?.provider ?? "prodamus"
);
const availableLavaCatalog = computed(() => {
  const selectedOfferId = binding("lava").externalOfferId;
  return props.lavaCatalog.filter((item) =>
    !item.isStale &&
    (item.isSelectable || item.externalOfferId === selectedOfferId)
  );
});
const selectedLavaCatalogItem = computed(() => {
  const current = binding("lava");
  return props.lavaCatalog.find((item) =>
    item.externalOfferId === current.externalOfferId &&
    (!current.externalProductId || item.externalProductId === current.externalProductId)
  ) ?? null;
});
const availableLavaPeriods = computed(() =>
  selectedLavaCatalogItem.value ? lavaCatalogPeriodOptions(selectedLavaCatalogItem.value) : []
);

function binding(provider: PaymentProviderCode) {
  return props.modelValue.find((entry) => entry.provider === provider) ?? {
    provider,
    enabled: false,
    externalProductId: null,
    externalOfferId: null,
    prices: []
  };
}

function update(provider: PaymentProviderCode, patch: Partial<PaymentProductProviderBinding>) {
  const next = ["prodamus", "lava"].map((code) => {
    const current = binding(code as PaymentProviderCode);
    return current.provider === provider ? { ...current, ...patch } : current;
  });
  emit("update:modelValue", next);
}

function selectProvider(provider: PaymentProviderCode) {
  emit("update:modelValue", (["prodamus", "lava"] as PaymentProviderCode[]).map((code) => ({
    ...binding(code),
    enabled: code === provider
  })));
}

watch(
  () => props.modelValue,
  (bindings) => {
    if (bindings.filter((entry) => entry.enabled).length === 1) return;
    const selected = bindings.find((entry) => entry.enabled)?.provider ?? "prodamus";
    emit("update:modelValue", (["prodamus", "lava"] as PaymentProviderCode[]).map((code) => ({
      ...binding(code),
      enabled: code === selected
    })));
  },
  { immediate: true, deep: true }
);

function chooseLava(value: string) {
  const item = props.lavaCatalog.find((entry) => entry.id === value);
  const accessDays = item ? lavaCatalogAccessDays(item.periodicity ?? null) ?? props.accessDays : props.accessDays;
  const fixedPrices = (item ? lavaCatalogPricesForTariff(item, item.kind, accessDays) : [])
    .filter((price): price is typeof price & { amountMinor: number } => price.amountMinor !== null)
    .map((price) => ({ currency: price.currency, amountMinor: price.amountMinor, isEnabled: true }));
  update("lava", {
    externalProductId: item?.externalProductId ?? null,
    externalOfferId: item?.externalOfferId ?? null,
    prices: fixedPrices
  });
  if (item) emit("lava-item-selected", item);
}

function chooseLavaPeriod(accessDays: number) {
  emit("lava-period-selected", accessDays);
}

const lavaPriceOptions = computed(() => {
  const selected = selectedLavaCatalogItem.value;
  return selected
    ? lavaCatalogPricesForTariff(selected, props.kind, props.accessDays)
      .map((price) => ({ currency: price.currency, amountMinor: price.amountMinor }))
    : (["RUB", "USD", "EUR"] as PaymentCurrency[]).map((currency) => ({ currency, amountMinor: null }));
});

function lavaPrice(currency: PaymentCurrency) {
  return lavaPrices().find((price) => price.currency === currency) ?? null;
}

function lavaPrices() {
  return (binding("lava").prices ?? []).map((price) => ({ ...price, isEnabled: price.isEnabled ?? true }));
}

function isLavaPriceSelected(currency: PaymentCurrency) {
  return Boolean(lavaPrice(currency)?.isEnabled);
}

function amountMinorFor(currency: PaymentCurrency, fixedAmountMinor: number | null) {
  return fixedAmountMinor ?? lavaPrice(currency)?.amountMinor ?? null;
}

function updateLavaPrices(nextPrices: Array<{ currency: PaymentCurrency; amountMinor: number; isEnabled: boolean }>) {
  update("lava", { prices: nextPrices });
}

function toggleLavaPrice(currency: PaymentCurrency, fixedAmountMinor: number | null, checked: boolean) {
  const current = lavaPrices();
  const existing = lavaPrice(currency);
  if (!checked) {
    if (current.filter((price) => price.isEnabled).length <= 1 && existing?.isEnabled) return;
    updateLavaPrices(current.map((price) => price.currency === currency ? { ...price, isEnabled: false } : price));
    return;
  }
  const amountMinor = amountMinorFor(currency, fixedAmountMinor);
  if (!amountMinor || amountMinor <= 0) return;
  updateLavaPrices(existing
    ? current.map((price) => price.currency === currency ? { ...price, amountMinor, isEnabled: true } : price)
    : [...current, { currency, amountMinor, isEnabled: true }]
  );
}

function majorAmount(currency: PaymentCurrency) {
  const amountMinor = lavaPrice(currency)?.amountMinor;
  return amountMinor ? (amountMinor / 100).toFixed(2) : "";
}

function updateDynamicAmount(currency: PaymentCurrency, value: string) {
  const normalized = value.trim().replace(",", ".");
  const valid = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized);
  const amountMinor = valid ? Math.round(Number(normalized) * 100) : 0;
  const current = lavaPrices();
  const existing = lavaPrice(currency);
  if (!amountMinor) {
    updateLavaPrices(current.filter((price) => price.currency !== currency));
    return;
  }
  updateLavaPrices(existing
    ? current.map((price) => price.currency === currency ? { ...price, amountMinor } : price)
    : [...current, { currency, amountMinor, isEnabled: false }]
  );
}

function formatCatalogPrice(price: { currency: PaymentCurrency; amountMinor: number | null }) {
  if (price.amountMinor === null) return `${price.currency}: цена в Lava`;
  return formatPaymentMoney({ currency: price.currency, amountMinor: price.amountMinor });
}

function catalogPricesForOption(item: PaymentProviderCatalogItem) {
  const accessDays = lavaCatalogAccessDays(item.periodicity ?? null) ?? props.accessDays;
  return lavaCatalogPricesForTariff(item, item.kind, accessDays);
}

function sameLavaPrices(
  current: Array<{ currency: PaymentCurrency; amountMinor: number; isEnabled: boolean }>,
  next: Array<{ currency: PaymentCurrency; amountMinor: number; isEnabled: boolean }>
) {
  return current.length === next.length && current.every((price, index) => {
    const candidate = next[index];
    return candidate?.currency === price.currency &&
      candidate.amountMinor === price.amountMinor &&
      candidate.isEnabled === price.isEnabled;
  });
}

watch(
  () => {
    const selected = selectedLavaCatalogItem.value;
    const prices = selected ? lavaCatalogPricesForTariff(selected, props.kind, props.accessDays) : [];
    return [selected?.id, selected?.syncedAt, props.kind, props.accessDays, JSON.stringify(prices)] as const;
  },
  () => {
    const selected = selectedLavaCatalogItem.value;
    if (!selected) return;
    const catalogPrices = lavaCatalogPricesForTariff(selected, props.kind, props.accessDays);
    if (!catalogPrices.length) return;
    const current = lavaPrices();
    const hasCurrentPrices = current.length > 0;
    const next = catalogPrices.flatMap((price) => {
      const existing = current.find((entry) => entry.currency === price.currency);
      const amountMinor = price.amountMinor ?? existing?.amountMinor ?? null;
      if (!amountMinor) return [];
      return [{
        currency: price.currency,
        amountMinor,
        isEnabled: existing?.isEnabled ?? !hasCurrentPrices
      }];
    });
    if (next.length && !next.some((price) => price.isEnabled)) next[0] = { ...next[0]!, isEnabled: true };
    if (!sameLavaPrices(current, next)) updateLavaPrices(next);
  },
  { immediate: true }
);
</script>

<template>
  <fieldset class="product-bindings">
    <legend>Платёжная система</legend>
    <div class="product-binding">
      <label class="product-binding__toggle">
        <span><strong>Prodamus</strong><small>Прямая оплата и подписки</small></span>
        <input
          :checked="selectedProvider === 'prodamus'"
          type="radio"
          name="payment-provider"
          aria-label="Prodamus"
          @change="selectProvider('prodamus')"
        />
      </label>
      <label v-if="selectedProvider === 'prodamus' && kind === 'recurrent'">
        <span>ID подписки Prodamus</span>
        <input
          :value="binding('prodamus').externalProductId ?? ''"
          placeholder="Например, 12345"
          @input="update('prodamus', { externalProductId: ($event.target as HTMLInputElement).value || null })"
        />
      </label>
    </div>

    <div class="product-binding">
      <label class="product-binding__toggle">
        <span><strong>Lava</strong><small>Разовая или рекуррентная оплата</small></span>
        <input
          :checked="selectedProvider === 'lava'"
          type="radio"
          name="payment-provider"
          aria-label="Lava"
          @change="selectProvider('lava')"
        />
      </label>
      <template v-if="selectedProvider === 'lava'">
        <label v-if="availableLavaCatalog.length">
          <span>Предложение Lava</span>
          <select
            aria-label="Предложение Lava"
            :value="availableLavaCatalog.find((entry) => entry.externalOfferId === binding('lava').externalOfferId)?.id ?? ''"
            @change="chooseLava(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Выберите товар</option>
            <option v-for="item in availableLavaCatalog" :key="item.id" :value="item.id">
              {{ item.title }}<template v-if="catalogPricesForOption(item).length"> · {{ catalogPricesForOption(item).map(formatCatalogPrice).join(" · ") }}</template>
              <template v-else-if="item.amountRub !== null"> · {{ formatPaymentMoney({ currency: 'RUB', amountMinor: item.amountRub * 100 }) }}</template>
              · {{ item.kind === "recurrent" ? "Подписка" : "Разовая оплата" }}
            </option>
          </select>
        </label>
        <fieldset v-if="availableLavaPeriods.length" class="product-binding__periods">
          <legend>Период подписки</legend>
          <div class="product-binding__period-grid">
            <label v-for="period in availableLavaPeriods" :key="period.periodicity" class="product-binding__period-option">
              <input
                type="radio"
                name="lava-subscription-period"
                :aria-label="period.label"
                :checked="accessDays === period.accessDays"
                @change="chooseLavaPeriod(period.accessDays)"
              />
              <span>{{ period.label }}</span>
            </label>
          </div>
        </fieldset>
        <fieldset class="product-binding__currencies">
          <legend>Валюты для оплаты</legend>
          <p>Выберите хотя бы одну валюту. Фиксированные цены Lava изменить нельзя.</p>
          <p v-if="selectedLavaCatalogItem && !lavaPriceOptions.length" class="product-binding__currency-empty">
            Для выбранного периода в Lava нет доступных цен.
          </p>
          <div v-for="option in lavaPriceOptions" :key="option.currency" class="product-binding__currency-row">
            <label :for="`lava-price-${option.currency}`" class="product-binding__currency-toggle">
              <input
                :id="`lava-price-${option.currency}`"
                type="checkbox"
                :aria-label="`Оплата в ${option.currency}`"
                :checked="isLavaPriceSelected(option.currency)"
                :disabled="amountMinorFor(option.currency, option.amountMinor) === null"
                @change="toggleLavaPrice(option.currency, option.amountMinor, ($event.target as HTMLInputElement).checked)"
              />
              <span class="product-binding__currency-code">{{ option.currency }}</span>
            </label>
            <output v-if="option.amountMinor !== null">{{ formatPaymentMoney({ currency: option.currency, amountMinor: option.amountMinor }) }}</output>
            <label v-else :for="`lava-price-amount-${option.currency}`" class="product-binding__currency-amount">
              <span class="sr-only">Сумма {{ option.currency }}</span>
              <input
                :id="`lava-price-amount-${option.currency}`"
                type="number"
                min="0.01"
                step="0.01"
                inputmode="decimal"
                :aria-label="`Сумма ${option.currency}`"
                :value="majorAmount(option.currency)"
                @input="updateDynamicAmount(option.currency, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </fieldset>
        <details class="product-binding__manual">
          <summary>Указать вручную</summary>
          <label><span>ID товара</span><input :value="binding('lava').externalProductId ?? ''" @input="update('lava', { externalProductId: ($event.target as HTMLInputElement).value || null })" /></label>
          <label><span>ID предложения</span><input :value="binding('lava').externalOfferId ?? ''" @input="update('lava', { externalOfferId: ($event.target as HTMLInputElement).value || null })" /></label>
        </details>
      </template>
    </div>
  </fieldset>
</template>

<style scoped>
.product-bindings{display:grid;gap:12px;min-width:0;margin:0;padding:0;border:0}.product-bindings>legend{margin-bottom:8px;color:var(--muted);font-size:.875rem;font-weight:700}.product-binding{display:grid;gap:12px;min-width:0;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--field)}.product-binding__toggle{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.product-binding__toggle>span{display:grid;gap:3px;min-width:0}.product-binding__toggle small{color:var(--muted)}.product-binding__toggle input{width:22px;height:22px;flex:none}.product-binding label{display:grid;gap:7px;color:var(--muted);font-size:.82rem;font-weight:700}.product-binding input:not([type=radio]):not([type=checkbox]),.product-binding select{width:100%;min-width:0;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font:inherit}.product-binding__periods{display:grid;gap:8px;min-width:0;margin:0;padding:12px;border:1px solid var(--line);border-radius:14px}.product-binding__periods legend{padding:0 4px;color:var(--text);font-size:.82rem;font-weight:800}.product-binding__period-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.product-binding__period-option{position:relative;display:block!important;min-width:0}.product-binding__period-option input{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}.product-binding__period-option span{display:flex;align-items:center;justify-content:center;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--muted);font-size:.78rem;font-weight:800;text-align:center}.product-binding__period-option input:checked+span{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--text)}.product-binding__period-option input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}.product-binding__manual{display:grid;gap:10px;min-width:0}.product-binding__manual summary{min-height:44px;padding:12px 0;color:var(--accent);font-weight:750;cursor:pointer}.product-binding__manual[open] summary{margin-bottom:8px}.product-binding__currencies{display:grid;gap:8px;min-width:0;margin:0;padding:12px;border:1px solid var(--line);border-radius:14px}.product-binding__currencies legend{padding:0 4px;color:var(--text);font-size:.82rem;font-weight:800}.product-binding__currencies>p{margin:0;color:var(--muted);font-size:.72rem;line-height:1.4}.product-binding__currency-empty{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--warning) 12%,transparent);color:var(--warning-text)!important}.product-binding__currency-row{display:grid;grid-template-columns:minmax(5.5rem,1fr) minmax(6rem,1.25fr);align-items:center;gap:10px;min-width:0;min-height:48px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--line) 72%,transparent);border-radius:12px;background:color-mix(in srgb,var(--surface) 82%,transparent)}.product-binding__currency-toggle{display:flex!important;align-items:center;gap:9px;min-width:0;min-height:32px;color:var(--text)!important}.product-binding__currency-toggle input{width:20px;height:20px;min-height:20px;flex:0 0 20px;margin:0;padding:0;accent-color:var(--accent)}.product-binding__currency-code{white-space:nowrap;font-size:.86rem;font-weight:800}.product-binding__currency-row output{min-width:0;color:var(--text);font-size:.86rem;font-weight:750;text-align:right;white-space:nowrap}.product-binding__currency-amount input{min-height:40px!important;text-align:right}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
