<script setup lang="ts">
import type {
  PaymentProductKind,
  PaymentProductProviderBinding,
  PaymentProviderCatalogItem,
  PaymentProviderCode
} from "@club/shared";

const props = defineProps<{
  modelValue: PaymentProductProviderBinding[];
  kind: PaymentProductKind;
  lavaCatalog: PaymentProviderCatalogItem[];
}>();
const emit = defineEmits<{ "update:modelValue": [bindings: PaymentProductProviderBinding[]] }>();

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

function chooseLava(value: string) {
  const item = props.lavaCatalog.find((entry) => entry.id === value);
  update("lava", {
    externalProductId: item?.externalProductId ?? null,
    externalOfferId: item?.externalOfferId ?? null
  });
}
</script>

<template>
  <fieldset class="product-bindings">
    <legend>Способы оплаты</legend>
    <div class="product-binding">
      <label class="product-binding__toggle">
        <span><strong>Prodamus</strong><small>Прямая оплата и подписки</small></span>
        <input
          :checked="binding('prodamus').enabled"
          type="checkbox"
          aria-label="Prodamus"
          @change="update('prodamus', { enabled: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <label v-if="binding('prodamus').enabled && kind === 'recurrent'">
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
          :checked="binding('lava').enabled"
          type="checkbox"
          aria-label="Lava"
          @change="update('lava', { enabled: ($event.target as HTMLInputElement).checked })"
        />
      </label>
      <template v-if="binding('lava').enabled">
        <label v-if="lavaCatalog.length">
          <span>Предложение Lava</span>
          <select
            :value="lavaCatalog.find((entry) => entry.externalOfferId === binding('lava').externalOfferId)?.id ?? ''"
            @change="chooseLava(($event.target as HTMLSelectElement).value)"
          >
            <option value="">Выберите товар</option>
            <option v-for="item in lavaCatalog.filter((entry) => !entry.isStale && entry.kind === kind)" :key="item.id" :value="item.id">
              {{ item.title }}<template v-if="item.amountRub !== null"> · {{ item.amountRub }} ₽</template>
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
.product-bindings{display:grid;gap:12px;min-width:0;margin:0;padding:0;border:0}.product-bindings>legend{margin-bottom:8px;color:var(--muted);font-size:.875rem;font-weight:700}.product-binding{display:grid;gap:12px;min-width:0;padding:14px;border:1px solid var(--line);border-radius:18px;background:var(--field)}.product-binding__toggle{display:flex!important;align-items:center;justify-content:space-between;gap:12px}.product-binding__toggle>span{display:grid;gap:3px;min-width:0}.product-binding__toggle small{color:var(--muted)}.product-binding__toggle input{width:22px;height:22px;flex:none}.product-binding label{display:grid;gap:7px;color:var(--muted);font-size:.82rem;font-weight:700}.product-binding input:not([type=checkbox]),.product-binding select{width:100%;min-width:0;min-height:46px;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font:inherit}.product-binding__manual{display:grid;gap:10px;min-width:0}.product-binding__manual summary{min-height:44px;padding:12px 0;color:var(--accent);font-weight:750;cursor:pointer}.product-binding__manual[open] summary{margin-bottom:8px}
</style>
