<script setup lang="ts">
import type { PaymentCurrency, PaymentMoney } from "@club/shared";
import { formatPaymentMoney } from "./paymentMoney";

defineProps<{ options: PaymentMoney[] }>();
defineEmits<{ select: [currency: PaymentCurrency]; close: [] }>();
</script>

<template>
  <div class="currency-choice" role="group" aria-label="Валюта оплаты">
    <button
      v-for="option in options"
      :key="option.currency"
      class="currency-choice__button"
      type="button"
      :aria-label="`${formatPaymentMoney(option)} (${option.currency})`"
      @click="$emit('select', option.currency)"
    >
      <span><strong>{{ formatPaymentMoney(option) }}</strong><small>{{ option.currency }}</small></span>
      <span aria-hidden="true">›</span>
    </button>
    <button class="currency-choice__cancel" type="button" @click="$emit('close')">Отмена</button>
  </div>
</template>

<style scoped>
.currency-choice{display:grid;gap:10px;min-width:0;padding-bottom:max(4px,env(safe-area-inset-bottom))}.currency-choice__button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0;min-height:56px;padding:10px 14px;border:1px solid var(--line);border-radius:16px;background:var(--field);color:var(--text);font:inherit;text-align:left}.currency-choice__button>span:first-child{display:grid;gap:2px;min-width:0}.currency-choice__button strong{font-size:1rem}.currency-choice__button small{color:var(--muted);font-size:.75rem;font-weight:700}.currency-choice__cancel{width:100%;min-height:48px;border:1px solid var(--line);border-radius:16px;background:transparent;color:var(--muted);font:inherit;font-weight:700}.currency-choice__button:focus-visible,.currency-choice__cancel:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style>
