<script setup lang="ts">
import type { AdminFinanceAnalyticsResponse } from "@club/shared";
import AdminFinanceDonut from "./AdminFinanceDonut.vue";
import AdminFinanceRing from "./AdminFinanceRing.vue";
import { formatAdminCompactMoney } from "./adminCompactMoney";

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

function distributionLabel(title: string, totalRub: number, rows: Array<{ title: string; revenuePercent: number }>) {
  return `${title}, общая выручка ${money(totalRub)}: ${rows.map((row) => `${row.title} ${valuePercent(row.revenuePercent)}`).join(", ")}`;
}

function clientCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11
    ? "клиент"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? "клиента"
      : "клиентов";
  return `${count} ${noun}`;
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
    <section class="admin-finance-insight admin-finance-pulse ui-card" aria-labelledby="finance-pulse-title">
      <header>
        <div><h4 id="finance-pulse-title">Финансовый пульс</h4><p>Главные показатели выбранного периода и удержания.</p></div>
        <span class="admin-finance-live-badge"><i></i>Актуально</span>
      </header>
      <div class="admin-finance-pulse-layout">
        <AdminFinanceRing
          :percent="data.overview.successPercent"
          :value="valuePercent(data.overview.successPercent)"
          label="Успешные оплаты"
          :caption="`${data.overview.paidOrders} из ${data.overview.totalAttempts} попыток`"
          tone="accent"
        />
        <div class="admin-finance-pulse-metrics">
          <article class="is-active"><span>Активны сейчас</span><strong>{{ data.retention.activeCustomers }}</strong><small>{{ valuePercent(data.retention.activePercent) }} от плативших</small></article>
          <article class="is-churned"><span>Не продлили</span><strong>{{ data.retention.churnedCustomers }}</strong><small>{{ valuePercent(data.retention.churnedPercent) }} от плативших</small></article>
          <article class="is-warning"><span>Ушли после продлений</span><strong>{{ data.retention.repeatPurchaseChurned }}</strong><small>{{ valuePercent(data.retention.repeatPurchaseChurnedPercent) }} от оттока</small></article>
        </div>
      </div>
    </section>

    <section class="admin-finance-insight ui-card" aria-labelledby="finance-providers-title">
      <header>
        <div><h4 id="finance-providers-title">Платёжные системы</h4><p>Кто проводит платежи стабильнее и приносит больше выручки.</p></div>
      </header>
      <div v-if="data.providers.length" class="admin-finance-distribution">
        <AdminFinanceDonut
          :value="formatAdminCompactMoney(data.overview.revenueRub)"
          label="выручка"
          :accessible-label="distributionLabel('Распределение выручки по платёжным системам', data.overview.revenueRub, data.providers)"
          :segments="data.providers.map((provider) => ({ label: provider.title, percent: provider.revenuePercent }))"
        />
        <div class="admin-finance-share-list">
          <article v-for="(provider, index) in data.providers" :key="provider.provider" class="admin-finance-share-row">
          <span class="admin-finance-legend-dot" :class="`is-segment-${index % 8}`" aria-hidden="true"></span>
          <div class="admin-finance-share-content">
            <div class="admin-finance-ranked-head"><strong>{{ provider.title }}</strong><span><b>{{ money(provider.revenueRub) }}</b><small>{{ valuePercent(provider.revenuePercent) }} выручки</small></span></div>
            <div class="admin-finance-share-metrics">
              <span><small>Оплаты</small><b>{{ provider.paidOrders }}</b></span>
              <span><small>Клиенты</small><b>{{ provider.uniqueCustomers }}</b></span>
              <span><small>Успешность</small><b>{{ valuePercent(provider.successPercent) }}</b></span>
            </div>
            <small>Средний чек {{ money(provider.averagePaidOrderRub) }}</small>
          </div>
          </article>
        </div>
      </div>
      <p v-else class="admin-empty">Оплат через подключённые системы за период не было.</p>
    </section>

    <section class="admin-finance-insight ui-card" aria-labelledby="finance-products-title">
      <header>
        <div><h4 id="finance-products-title">Продукты и тарифы</h4><p>Что покупают и какой продукт приносит выручку.</p></div>
      </header>
      <div v-if="data.products.length" class="admin-finance-distribution">
        <AdminFinanceDonut
          :value="formatAdminCompactMoney(data.overview.revenueRub)"
          label="выручка"
          :accessible-label="distributionLabel('Распределение выручки по продуктам', data.overview.revenueRub, data.products)"
          :segments="data.products.map((product) => ({ label: product.title, percent: product.revenuePercent }))"
        />
        <div class="admin-finance-share-list">
        <article v-for="(product, index) in data.products" :key="product.productId ?? `${product.kind}:${product.title}`" class="admin-finance-share-row">
          <span class="admin-finance-legend-dot" :class="`is-segment-${index % 8}`" aria-hidden="true"></span>
          <div class="admin-finance-share-content">
            <div class="admin-finance-ranked-head"><strong>{{ product.title }}</strong><span><b>{{ money(product.revenueRub) }}</b><small>{{ valuePercent(product.revenuePercent) }} выручки</small></span></div>
            <div class="admin-finance-share-metrics">
              <span><small>Оплаты</small><b>{{ product.paidOrders }}</b></span>
              <span><small>Клиенты</small><b>{{ product.uniqueCustomers }}</b></span>
              <span><small>Средний чек</small><b>{{ money(product.averagePaidOrderRub) }}</b></span>
            </div>
          </div>
        </article>
        </div>
      </div>
      <p v-else class="admin-empty">Успешных оплат продуктов за период не было.</p>
    </section>

    <section class="admin-finance-insight admin-finance-retention ui-card" aria-labelledby="finance-retention-title" aria-label="Удержание платящих клиентов">
      <header>
        <div><h4 id="finance-retention-title">Удержание клиентов</h4><p>Кто остаётся после первой и последующих оплат.</p></div>
        <span class="admin-finance-lifetime-badge">За всё время</span>
      </header>

      <template v-if="data.retention.totalPayingCustomers">
        <div class="admin-finance-retention-hero">
          <AdminFinanceRing
            :percent="data.retention.activePercent"
            :value="valuePercent(data.retention.activePercent)"
            label="Удержание"
            :caption="`${data.retention.activeCustomers} активны из ${data.retention.totalPayingCustomers}`"
            tone="success"
            size="hero"
          />
          <div class="admin-finance-retention-summary">
            <article><span>Уникальные клиенты</span><strong>{{ data.retention.totalPayingCustomers }}</strong><small>хотя бы одна оплата</small></article>
            <article class="is-active"><span>Активны сейчас</span><strong>{{ data.retention.activeCustomers }}</strong><small>{{ valuePercent(data.retention.activePercent) }}</small></article>
            <article class="is-churned"><span>Не продлили</span><strong>{{ data.retention.churnedCustomers }}</strong><small>{{ valuePercent(data.retention.churnedPercent) }}</small></article>
          </div>
        </div>

        <template v-if="data.retention.churnedCustomers > 0">
        <div
          class="admin-finance-churn-composition"
          role="img"
          :aria-label="`Структура оттока: купили один раз — ${clientCountLabel(data.retention.onePurchaseChurned)}, ${valuePercent(data.retention.onePurchaseChurnedPercent)}; продлевали, но ушли — ${clientCountLabel(data.retention.repeatPurchaseChurned)}, ${valuePercent(data.retention.repeatPurchaseChurnedPercent)}`"
        >
          <div class="admin-finance-churn-composition-bar" aria-hidden="true">
            <span class="is-first-purchase" :style="{ width: progress(data.retention.onePurchaseChurnedPercent) }"></span>
            <span class="is-repeat-purchase" :style="{ width: progress(data.retention.repeatPurchaseChurnedPercent) }"></span>
          </div>
          <div class="admin-finance-churn-composition-legend">
            <article><i class="is-first-purchase" aria-hidden="true"></i><span><strong>Купили один раз</strong><small>и больше не вернулись</small></span><b>{{ data.retention.onePurchaseChurned }}</b><em>{{ valuePercent(data.retention.onePurchaseChurnedPercent) }}</em></article>
            <article><i class="is-repeat-purchase" aria-hidden="true"></i><span><strong>Продлевали, но ушли</strong><small>от не продливших</small></span><b>{{ data.retention.repeatPurchaseChurned }}</b><em>{{ valuePercent(data.retention.repeatPurchaseChurnedPercent) }}</em></article>
          </div>
        </div>

        <div v-if="data.retention.exitStages.length" class="admin-finance-retention-group admin-finance-stage-group">
          <h5>После какого продления уходят</h5>
          <div class="admin-finance-stage-list">
            <article v-for="stage in data.retention.exitStages" :key="stage.renewals">
              <div><span>{{ stage.label }}</span><strong>{{ stage.customers }}</strong></div>
              <div class="admin-finance-stage-bar" aria-hidden="true"><span :style="{ width: progress(stage.percentOfRepeatChurned) }"></span></div>
              <small>{{ valuePercent(stage.percentOfRepeatChurned) }} от ушедших после продлений</small>
            </article>
          </div>
        </div>

        <div v-if="data.retention.byProducts.length || data.retention.byProviders.length" class="admin-finance-retention-breakdowns">
          <div v-if="data.retention.byProducts.length" class="admin-finance-retention-group">
            <h5>Отток по последнему продукту</h5>
            <div class="admin-finance-breakdown-chart">
              <article v-for="row in data.retention.byProducts" :key="row.key" class="admin-finance-breakdown-row" role="img" :aria-label="`Отток ${row.title}: ${valuePercent(row.churnedPercent)}. ${row.churnedCustomers} из ${row.totalCustomers} клиентов не продлили`">
                <div><strong>{{ row.title }}</strong><b>{{ valuePercent(row.churnedPercent) }}</b></div>
                <div class="admin-finance-progress admin-finance-churn-bar" aria-hidden="true"><span :style="{ width: progress(row.churnedPercent) }"></span></div>
                <small>{{ row.churnedCustomers }} из {{ row.totalCustomers }} клиентов</small>
              </article>
            </div>
          </div>
          <div v-if="data.retention.byProviders.length" class="admin-finance-retention-group">
            <h5>Отток по платёжной системе</h5>
            <div class="admin-finance-breakdown-chart is-provider-chart">
              <article v-for="row in data.retention.byProviders" :key="row.key" class="admin-finance-breakdown-row" role="img" :aria-label="`Отток ${row.title}: ${valuePercent(row.churnedPercent)}. ${row.churnedCustomers} из ${row.totalCustomers} клиентов не продлили`">
                <div><strong>{{ row.title }}</strong><b>{{ valuePercent(row.churnedPercent) }}</b></div>
                <div class="admin-finance-progress admin-finance-churn-bar is-info" aria-hidden="true"><span :style="{ width: progress(row.churnedPercent) }"></span></div>
                <small>{{ row.churnedCustomers }} из {{ row.totalCustomers }} клиентов</small>
              </article>
            </div>
          </div>
        </div>
        </template>
        <div v-else class="admin-finance-no-churn"><span aria-hidden="true">✓</span><div><strong>Оттока пока нет</strong><small>Все платившие клиенты остаются активными.</small></div></div>
      </template>
      <p v-else class="admin-empty">Платящих клиентов пока нет.</p>
    </section>
  </template>
</template>
