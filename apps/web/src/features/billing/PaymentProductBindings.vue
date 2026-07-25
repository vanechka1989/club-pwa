<script setup lang="ts">
import type {
  PaymentProductKind,
  PaymentProductProviderBinding,
  PaymentProviderCatalogItem,
  PaymentProviderCode
} from "@club/shared";
import { computed, watch } from "vue";

const props = defineProps<{
  modelValue: PaymentProductProviderBinding[];
  kind: PaymentProductKind;
  lavaCatalog: PaymentProviderCatalogItem[];
}>();
const emit = defineEmits<{
  "update:modelValue": [bindings: PaymentProductProviderBinding[]];
  "lava-item-selected": [item: PaymentProviderCatalogItem];
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

function binding(provider: PaymentProviderCode) {
  return props.modelValue.find((entry) => entry.provider === provider) ?? {
    provider,
    enabled: false,
    externalProductId: null,
    externalOfferId: null
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
  update("lava", {
    externalProductId: item?.externalProductId ?? null,
    externalOfferId: item?.externalOfferId ?? null
  });
  if (item) emit("lava-item-selected", item);
}
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
              {{ item.title }}<template v-if="item.amountRub !== null"> · {{ item.amountRub }} ₽</template>
              · {{ item.kind === "recurrent" ? "Подписка" : "Разовая оплата" }}
            </option>
          </select>
        </label>
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
.product-bindings{display:grid;gap:12px;min-width:0;margin:0;padding:0;border:0}.product-bindings>legend{margin-bottom:8px;color:var(--muted);font-size:.875rem;font-weight:700}.product-binding{display:grid;gap:12px;min-width:0;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--field)}.product-binding__toggle{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.product-binding__toggle>span{display:grid;gap:3px;min-width:0}.product-binding__toggle small{color:var(--muted)}.product-binding__toggle input{width:22px;height:22px;flex:none}.product-binding label{display:grid;gap:7px;color:var(--muted);font-size:.82rem;font-weight:700}.product-binding input:not([type=radio]),.product-binding select{width:100%;min-width:0;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font:inherit}.product-binding__manual{display:grid;gap:10px;min-width:0}.product-binding__manual summary{min-height:44px;padding:12px 0;color:var(--accent);font-weight:750;cursor:pointer}.product-binding__manual[open] summary{margin-bottom:8px}
</style>
