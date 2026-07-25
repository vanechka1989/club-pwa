<script setup lang="ts">
import type { PaymentCheckoutOption, PaymentProviderCode } from "@club/shared";
import { CreditCard, Flame } from "lucide-vue-next";

defineProps<{ options: PaymentCheckoutOption[] }>();
defineEmits<{ select: [provider: PaymentProviderCode]; close: [] }>();
</script>

<template>
  <div class="provider-choice" role="group" aria-label="Способ оплаты">
    <button
      v-for="option in options"
      :key="option.provider"
      class="provider-choice__button"
      type="button"
      :aria-label="`Оплатить через ${option.title}`"
      @click="$emit('select', option.provider)"
    >
      <span class="provider-choice__icon" aria-hidden="true">
        <Flame v-if="option.provider === 'lava'" :size="22" />
        <CreditCard v-else :size="22" />
      </span>
      <span class="provider-choice__copy">
        <strong>{{ option.title }}</strong>
        <small>Безопасная оплата на стороне сервиса</small>
      </span>
      <span aria-hidden="true">›</span>
    </button>
    <button class="provider-choice__cancel" type="button" @click="$emit('close')">Отмена</button>
  </div>
</template>

<style scoped>
.provider-choice{display:grid;gap:10px;min-width:0;padding-bottom:max(4px,env(safe-area-inset-bottom))}
.provider-choice__button{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:12px;width:100%;min-width:0;min-height:68px;padding:12px;border:1px solid var(--line);border-radius:18px;background:var(--field);color:var(--text);text-align:left}
.provider-choice__icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)}
.provider-choice__copy{display:grid;gap:3px;min-width:0}.provider-choice__copy strong,.provider-choice__copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.provider-choice__copy small{color:var(--muted)}
.provider-choice__cancel{width:100%;min-height:48px;border:1px solid var(--line);border-radius:16px;background:transparent;color:var(--muted);font:inherit;font-weight:700}
@media(max-width:360px){.provider-choice__button{grid-template-columns:40px minmax(0,1fr) auto;padding:10px}.provider-choice__icon{width:40px;height:40px}.provider-choice__copy small{white-space:normal}}
</style>
