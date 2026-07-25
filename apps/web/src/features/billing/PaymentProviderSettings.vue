<script setup lang="ts">
import type { PaymentProvider } from "@club/shared";
import { Copy, RefreshCw } from "lucide-vue-next";

const props = withDefaults(defineProps<{
  provider: PaymentProvider | null;
  busy?: boolean;
}>(), { busy: false });
defineEmits<{ check: []; sync: []; copy: [value: string] }>();

const stateLabels = {
  not_configured: "Не подключено",
  configured: "Подключено",
  verified: "Соединение проверено",
  error: "Ошибка подключения"
} as const;
</script>

<template>
  <div class="provider-settings">
    <div class="provider-settings__head">
      <div class="provider-settings__copy">
        <strong>Lava</strong>
        <span :class="`provider-settings__state provider-settings__state--${provider?.connectionState ?? 'not_configured'}`">
          {{ stateLabels[provider?.connectionState ?? "not_configured"] }}
        </span>
      </div>
      <span class="provider-settings__dot" :class="{ 'provider-settings__dot--on': provider?.isEnabled }" aria-hidden="true"></span>
    </div>

    <p v-if="provider?.lastCheckError" class="provider-settings__error">Не удалось проверить подключение. Проверьте API-ключ.</p>

    <div v-if="provider?.webhookUrls" class="provider-settings__urls">
      <label v-for="(value, key) in provider.webhookUrls" :key="key">
        <span>{{ key === "payment" ? "Уведомления об оплате" : "Уведомления о подписке" }}</span>
        <span class="provider-settings__url">
          <input :value="value" readonly />
          <button type="button" :aria-label="`Скопировать ${key}`" @click="$emit('copy', value)"><Copy :size="17" /></button>
        </span>
      </label>
    </div>

    <div class="provider-settings__actions">
      <button type="button" :disabled="busy || !provider?.secretConfigured" @click="$emit('check')">Проверить</button>
      <button type="button" :disabled="busy || !provider?.secretConfigured" @click="$emit('sync')">
        <RefreshCw :size="17" /> Обновить товары
      </button>
    </div>
  </div>
</template>

<style scoped>
.provider-settings{display:grid;gap:14px;min-width:0}.provider-settings__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.provider-settings__copy{display:grid;gap:5px;min-width:0}.provider-settings__copy strong{font-size:1.15rem}.provider-settings__state{width:max-content;max-width:100%;padding:5px 9px;border-radius:999px;color:var(--muted);background:var(--field);font-size:.78rem;font-weight:750}.provider-settings__state--verified{color:#49d6ad}.provider-settings__state--error,.provider-settings__error{color:var(--danger-text)}.provider-settings__dot{width:12px;height:12px;margin-top:5px;border-radius:50%;background:var(--muted)}.provider-settings__dot--on{background:var(--accent);box-shadow:0 0 0 5px color-mix(in srgb,var(--accent) 14%,transparent)}
.provider-settings__error{margin:0;font-size:.85rem}.provider-settings__urls{display:grid;gap:10px;min-width:0}.provider-settings__urls label{display:grid;gap:6px;min-width:0;color:var(--muted);font-size:.78rem;font-weight:700}.provider-settings__url{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:8px;min-width:0}.provider-settings__url input{min-width:0;height:44px;padding:0 12px;border:1px solid var(--line);border-radius:14px;background:var(--field);color:var(--text);text-overflow:ellipsis}.provider-settings__url button,.provider-settings__actions button{min-width:44px;min-height:44px;border:1px solid var(--line);border-radius:14px;background:var(--field);color:var(--text)}.provider-settings__actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.provider-settings__actions button{display:flex;align-items:center;justify-content:center;gap:7px;font:inherit;font-weight:750}.provider-settings__actions button:disabled{opacity:.5}
@media(max-width:340px){.provider-settings__actions{grid-template-columns:1fr}}
</style>
