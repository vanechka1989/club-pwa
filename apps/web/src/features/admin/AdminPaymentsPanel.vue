<script setup lang="ts">
import type { PaymentOrderLog, PaymentOrderLogsResponse } from "@club/shared";
import { onMounted, ref } from "vue";
import { getAdminPaymentHistory } from "@/api/client";

const data = ref<PaymentOrderLogsResponse | null>(null);
const loading = ref(false);
const error = ref("");

const diagnosticLabels: Record<NonNullable<PaymentOrderLog["diagnostic"]>["state"], string> = {
  paid: "Оплачено",
  awaiting_payment: "Ожидает оплату",
  expired: "Не оплачено",
  failed: "Ошибка оплаты",
  cancelled: "Отменено",
  webhook_error: "Ошибка webhook"
};

function customerTitle(order: PaymentOrderLog) {
  return order.customer.firstName || order.customer.username || order.customer.telegramId;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function diagnosticFor(order: PaymentOrderLog) {
  return order.diagnostic ?? {
    state: order.status === "paid" ? "paid" as const : order.status === "failed" ? "failed" as const : order.status === "cancelled" ? "cancelled" as const : "awaiting_payment" as const,
    reason: order.status === "paid" ? "Платёж подтверждён." : "Диагностика появится после обновления данных.",
    severity: order.status === "paid" ? "success" as const : order.status === "failed" ? "danger" as const : "info" as const
  };
}

function summaryFor(value: PaymentOrderLogsResponse) {
  if (value.summary) return value.summary;
  return value.orders.reduce((summary, order) => {
    const state = diagnosticFor(order).state;
    summary.total += 1;
    if (state === "paid") summary.paid += 1;
    else if (state === "awaiting_payment") summary.awaitingPayment += 1;
    else if (state === "expired") summary.expired += 1;
    else if (state === "failed") summary.failed += 1;
    else if (state === "cancelled") summary.cancelled += 1;
    else if (state === "webhook_error") summary.webhookErrors += 1;
    return summary;
  }, { total: 0, paid: 0, awaitingPayment: 0, expired: 0, failed: 0, cancelled: 0, webhookErrors: 0 });
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    data.value = await getAdminPaymentHistory();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Не удалось загрузить платежи.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="ops-panel">
    <header class="ops-head">
      <div><h3>Платежи</h3><p>Фактический результат оплаты, webhook и причины незавершённых заказов.</p></div>
      <button class="ops-button" type="button" :disabled="loading" @click="load">{{ loading ? "Загрузка…" : "Обновить" }}</button>
    </header>

    <div v-if="data" class="ops-summary">
      <article><span>Всего</span><strong>{{ summaryFor(data).total }}</strong></article>
      <article class="good"><span>Оплачено</span><strong>{{ summaryFor(data).paid }}</strong></article>
      <article><span>Ожидают</span><strong>{{ summaryFor(data).awaitingPayment }}</strong></article>
      <article class="warn"><span>Не оплачено</span><strong>{{ summaryFor(data).expired }}</strong></article>
      <article class="bad"><span>Ошибки</span><strong>{{ summaryFor(data).failed + summaryFor(data).webhookErrors }}</strong></article>
      <article><span>Отменено</span><strong>{{ summaryFor(data).cancelled }}</strong></article>
    </div>

    <p v-if="error" class="ops-error">{{ error }}</p>
    <div class="ops-list">
      <article v-for="order in data?.orders ?? []" :key="order.id" class="payment-card">
        <div class="payment-top">
          <div><strong>{{ order.productTitle }}</strong><small>{{ customerTitle(order) }} · {{ order.amountRub.toLocaleString("ru-RU") }} ₽</small></div>
          <em :class="`severity-${diagnosticFor(order).severity}`">{{ diagnosticLabels[diagnosticFor(order).state] }}</em>
        </div>
        <p>{{ diagnosticFor(order).reason }}</p>
        <div class="payment-meta">
          <span>{{ formatDate(order.createdAt) }}</span><span>{{ order.productKind === "recurrent" ? "Рекуррент" : "Разовый" }}</span>
          <span>Webhook: {{ order.webhook ? (order.webhook.isValid ? "валидный" : "ошибка подписи") : "не пришёл" }}</span>
        </div>
        <small class="payment-id">Заказ: {{ order.providerOrderId }}</small>
      </article>
      <p v-if="data && !data.orders.length" class="ops-empty">Заказов пока нет.</p>
    </div>
  </section>
</template>

<style scoped>
.ops-panel{display:grid;gap:16px}.ops-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.ops-head h3{margin:0;font-size:1.25rem}.ops-head p{margin:4px 0 0;color:var(--muted)}.ops-button{min-height:44px;padding:0 16px;border:1px solid var(--border);border-radius:14px;background:var(--surface-strong);color:var(--text);font:inherit;font-weight:700}.ops-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ops-summary article{display:grid;gap:4px;padding:14px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}.ops-summary span,.payment-card small,.payment-card p,.payment-meta{color:var(--muted)}.ops-summary strong{font-size:1.35rem}.good strong{color:var(--success,#28c98b)}.warn strong{color:#d8a92f}.bad strong{color:#e87979}.ops-list{display:grid;gap:10px}.payment-card{display:grid;gap:10px;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.payment-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.payment-top>div{display:grid;gap:4px;min-width:0}.payment-top em{flex:none;padding:6px 9px;border-radius:999px;font-size:.78rem;font-style:normal;font-weight:800}.severity-success{color:#52d8a7;background:rgba(39,181,130,.14)}.severity-info{color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}.severity-warning{color:#e0b541;background:rgba(224,181,65,.14)}.severity-danger{color:#ff8e8e;background:rgba(220,75,75,.15)}.payment-card p{margin:0}.payment-meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:.82rem}.payment-id{overflow-wrap:anywhere}.ops-error{margin:0;padding:12px;border-radius:14px;color:#ff9a9a;background:rgba(190,50,50,.13)}.ops-empty{text-align:center;color:var(--muted)}@media(max-width:420px){.ops-head{align-items:flex-start}.ops-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.payment-top{align-items:flex-start}.payment-top em{max-width:44%;text-align:center}}
</style>
