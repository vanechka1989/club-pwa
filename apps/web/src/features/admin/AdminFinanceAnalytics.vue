<script setup lang="ts">
import type { AdminFinanceAnalyticsResponse } from "@club/shared";

defineProps<{
  data: AdminFinanceAnalyticsResponse | null;
  loading: boolean;
  error: boolean;
}>();

defineEmits<{ retry: [] }>();

function money(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function valuePercent(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function progress(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}
</script>

<template>
  <section v-if="loading && !data" class="admin-finance-analytics-state ui-card" aria-live="polite">
    <span class="admin-finance-loading-dot" aria-hidden="true"></span>
    <p>Собираю финансовую аналитику…</p>
  </section>

  <section v-else-if="error && !data" class="admin-finance-analytics-state admin-finance-analytics-error ui-card">
    <p>Расширенную аналитику не удалось загрузить. Основные показатели выше доступны.</p>
    <button class="secondary-button ui-button" type="button" aria-label="Повторить загрузку финансовой аналитики" @click="$emit('retry')">Повторить</button>
  </section>

  <template v-else-if="data">
    <section class="admin-finance-insight ui-card" aria-labelledby="finance-providers-title">
      <header>
        <div><h4 id="finance-providers-title">Платёжные системы</h4><p>Использование, выручка и успешность за выбранный период.</p></div>
      </header>
      <div v-if="data.providers.length" class="admin-finance-ranked-list">
        <article v-for="provider in data.providers" :key="provider.provider" class="admin-finance-ranked-row">
          <div class="admin-finance-ranked-head"><strong>{{ provider.title }}</strong><b>{{ money(provider.revenueRub) }}</b></div>
          <div class="admin-finance-progress" aria-hidden="true"><span :style="{ width: progress(provider.revenuePercent) }"></span></div>
          <div class="admin-finance-ranked-meta">
            <span>{{ provider.paidOrders }} оплат · {{ provider.uniqueCustomers }} клиентов</span>
            <span>{{ valuePercent(provider.successPercent) }} успешных</span>
          </div>
          <small>Средний чек {{ money(provider.averagePaidOrderRub) }} · доля выручки {{ valuePercent(provider.revenuePercent) }}</small>
        </article>
      </div>
      <p v-else class="admin-empty">Оплат через подключённые системы за период не было.</p>
    </section>

    <section class="admin-finance-insight ui-card" aria-labelledby="finance-products-title">
      <header>
        <div><h4 id="finance-products-title">Продукты и тарифы</h4><p>Что покупают и какой продукт приносит выручку.</p></div>
      </header>
      <div v-if="data.products.length" class="admin-finance-ranked-list">
        <article v-for="product in data.products" :key="product.productId ?? `${product.kind}:${product.title}`" class="admin-finance-ranked-row">
          <div class="admin-finance-ranked-head"><strong>{{ product.title }}</strong><b>{{ money(product.revenueRub) }}</b></div>
          <div class="admin-finance-progress" aria-hidden="true"><span :style="{ width: progress(product.revenuePercent) }"></span></div>
          <div class="admin-finance-ranked-meta">
            <span>{{ product.kind === 'recurrent' ? 'Автоподписка' : 'Разовая оплата' }}</span>
            <span>{{ product.paidOrders }} оплат · {{ product.uniqueCustomers }} клиентов</span>
          </div>
          <small>Средний чек {{ money(product.averagePaidOrderRub) }} · доля выручки {{ valuePercent(product.revenuePercent) }}</small>
        </article>
      </div>
      <p v-else class="admin-empty">Успешных оплат продуктов за период не было.</p>
    </section>

    <section class="admin-finance-insight admin-finance-retention ui-card" aria-labelledby="finance-retention-title" aria-label="Удержание платящих клиентов">
      <header>
        <div><h4 id="finance-retention-title">Удержание клиентов</h4><p>Кто остаётся после первой и последующих оплат.</p></div>
        <span class="admin-finance-lifetime-badge">За всё время</span>
      </header>

      <template v-if="data.retention.totalPayingCustomers">
        <div class="admin-finance-retention-summary">
          <article><span>Уникальные клиенты</span><strong>{{ data.retention.totalPayingCustomers }}</strong><small>хотя бы одна оплата</small></article>
          <article class="is-active"><span>Активны сейчас</span><strong>{{ data.retention.activeCustomers }}</strong><small>{{ valuePercent(data.retention.activePercent) }}</small></article>
          <article class="is-churned"><span>Не продлили</span><strong>{{ data.retention.churnedCustomers }}</strong><small>{{ valuePercent(data.retention.churnedPercent) }}</small></article>
        </div>

        <div class="admin-finance-churn-split">
          <article>
            <div><span>Купили один раз</span><strong>{{ data.retention.onePurchaseChurned }}</strong></div>
            <small>{{ valuePercent(data.retention.onePurchaseChurnedPercent) }} от не продливших</small>
            <div class="admin-finance-progress is-warning" aria-hidden="true"><span :style="{ width: progress(data.retention.onePurchaseChurnedPercent) }"></span></div>
          </article>
          <article>
            <div><span>Продлевали, но ушли</span><strong>{{ data.retention.repeatPurchaseChurned }}</strong></div>
            <small>{{ valuePercent(data.retention.repeatPurchaseChurnedPercent) }} от не продливших</small>
            <div class="admin-finance-progress is-danger" aria-hidden="true"><span :style="{ width: progress(data.retention.repeatPurchaseChurnedPercent) }"></span></div>
          </article>
        </div>

        <div v-if="data.retention.exitStages.length" class="admin-finance-retention-group">
          <h5>После какого продления уходят</h5>
          <div class="admin-finance-stage-list">
            <article v-for="stage in data.retention.exitStages" :key="stage.renewals">
              <span>{{ stage.label }}</span><strong>{{ stage.customers }}</strong><small>{{ valuePercent(stage.percentOfRepeatChurned) }}</small>
            </article>
          </div>
        </div>

        <div v-if="data.retention.byProducts.length || data.retention.byProviders.length" class="admin-finance-retention-breakdowns">
          <div v-if="data.retention.byProducts.length" class="admin-finance-retention-group">
            <h5>Отток по последнему продукту</h5>
            <article v-for="row in data.retention.byProducts" :key="row.key" class="admin-finance-churn-row">
              <div><strong>{{ row.title }}</strong><b>{{ valuePercent(row.churnedPercent) }}</b></div>
              <small>{{ row.churnedCustomers }} не продлили из {{ row.totalCustomers }}</small>
            </article>
          </div>
          <div v-if="data.retention.byProviders.length" class="admin-finance-retention-group">
            <h5>Отток по платёжной системе</h5>
            <article v-for="row in data.retention.byProviders" :key="row.key" class="admin-finance-churn-row">
              <div><strong>{{ row.title }}</strong><b>{{ valuePercent(row.churnedPercent) }}</b></div>
              <small>{{ row.churnedCustomers }} не продлили из {{ row.totalCustomers }}</small>
            </article>
          </div>
        </div>
      </template>
      <p v-else class="admin-empty">Платящих клиентов пока нет.</p>
    </section>
  </template>
</template>
