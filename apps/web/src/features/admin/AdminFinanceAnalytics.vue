<script setup lang="ts">
import type { AdminFinanceAnalyticsResponse } from "@club/shared";
import AdminFinanceRing from "./AdminFinanceRing.vue";

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

function plural(value: number, forms: [string, string, string]) {
  const absolute = Math.abs(value) % 100;
  const last = absolute % 10;
  if (absolute > 10 && absolute < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last > 1 && last < 5) return forms[1];
  return forms[2];
}

function clients(value: number) {
  return `${value} ${plural(value, ["клиент", "клиента", "клиентов"])}`;
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
      <div class="admin-finance-pulse-grid">
        <AdminFinanceRing
          :percent="data.overview.successPercent"
          :value="valuePercent(data.overview.successPercent)"
          label="Успешные оплаты"
          :caption="`${data.overview.paidOrders} из ${data.overview.totalAttempts} попыток`"
          tone="accent"
        />
        <AdminFinanceRing
          :percent="data.retention.activePercent"
          :value="valuePercent(data.retention.activePercent)"
          label="Активны сейчас"
          :caption="`${data.retention.activeCustomers} из ${data.retention.totalPayingCustomers} клиентов`"
          tone="success"
        />
        <AdminFinanceRing
          :percent="data.retention.churnedPercent"
          :value="valuePercent(data.retention.churnedPercent)"
          label="Не продлили"
          :caption="clients(data.retention.churnedCustomers)"
          tone="danger"
        />
        <AdminFinanceRing
          :percent="data.retention.repeatPurchaseChurnedPercent"
          :value="valuePercent(data.retention.repeatPurchaseChurnedPercent)"
          label="Ушли после продлений"
          :caption="clients(data.retention.repeatPurchaseChurned)"
          tone="warning"
        />
      </div>
    </section>

    <section class="admin-finance-insight ui-card" aria-labelledby="finance-providers-title">
      <header>
        <div><h4 id="finance-providers-title">Платёжные системы</h4><p>Кто проводит платежи стабильнее и приносит больше выручки.</p></div>
      </header>
      <div v-if="data.providers.length" class="admin-finance-share-list">
        <article v-for="provider in data.providers" :key="provider.provider" class="admin-finance-share-row">
          <AdminFinanceRing
            :percent="provider.revenuePercent"
            :value="valuePercent(provider.revenuePercent)"
            :label="`Доля выручки ${provider.title}`"
            :caption="money(provider.revenueRub)"
            tone="accent"
            size="compact"
          />
          <div class="admin-finance-share-content">
            <div class="admin-finance-ranked-head"><strong>{{ provider.title }}</strong><b>{{ money(provider.revenueRub) }}</b></div>
            <div class="admin-finance-share-metrics">
              <span><small>Оплаты</small><b>{{ provider.paidOrders }}</b></span>
              <span><small>Клиенты</small><b>{{ provider.uniqueCustomers }}</b></span>
              <span><small>Успешность</small><b>{{ valuePercent(provider.successPercent) }}</b></span>
            </div>
            <div class="admin-finance-progress" aria-hidden="true"><span :style="{ width: progress(provider.revenuePercent) }"></span></div>
            <small>Средний чек {{ money(provider.averagePaidOrderRub) }}</small>
          </div>
        </article>
      </div>
      <p v-else class="admin-empty">Оплат через подключённые системы за период не было.</p>
    </section>

    <section class="admin-finance-insight ui-card" aria-labelledby="finance-products-title">
      <header>
        <div><h4 id="finance-products-title">Продукты и тарифы</h4><p>Что покупают и какой продукт приносит выручку.</p></div>
      </header>
      <div v-if="data.products.length" class="admin-finance-share-list">
        <article v-for="product in data.products" :key="product.productId ?? `${product.kind}:${product.title}`" class="admin-finance-share-row">
          <AdminFinanceRing
            :percent="product.revenuePercent"
            :value="valuePercent(product.revenuePercent)"
            :label="`Доля выручки ${product.title}`"
            :caption="money(product.revenueRub)"
            tone="info"
            size="compact"
          />
          <div class="admin-finance-share-content">
            <div class="admin-finance-ranked-head"><strong>{{ product.title }}</strong><b>{{ money(product.revenueRub) }}</b></div>
            <span class="admin-finance-product-kind">{{ product.kind === 'recurrent' ? 'Автоподписка' : 'Разовая оплата' }}</span>
            <div class="admin-finance-share-metrics">
              <span><small>Оплаты</small><b>{{ product.paidOrders }}</b></span>
              <span><small>Клиенты</small><b>{{ product.uniqueCustomers }}</b></span>
              <span><small>Средний чек</small><b>{{ money(product.averagePaidOrderRub) }}</b></span>
            </div>
            <div class="admin-finance-progress is-info" aria-hidden="true"><span :style="{ width: progress(product.revenuePercent) }"></span></div>
          </div>
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

        <div class="admin-finance-churn-split">
          <article>
            <AdminFinanceRing
              :percent="data.retention.onePurchaseChurnedPercent"
              :value="valuePercent(data.retention.onePurchaseChurnedPercent)"
              label="Купили один раз"
              :caption="clients(data.retention.onePurchaseChurned)"
              tone="warning"
              size="compact"
            />
            <div><strong>{{ data.retention.onePurchaseChurned }}</strong><span>Купили один раз</span><small>и больше не вернулись</small></div>
          </article>
          <article>
            <AdminFinanceRing
              :percent="data.retention.repeatPurchaseChurnedPercent"
              :value="valuePercent(data.retention.repeatPurchaseChurnedPercent)"
              label="Продлевали, но ушли"
              :caption="clients(data.retention.repeatPurchaseChurned)"
              tone="danger"
              size="compact"
            />
            <div><strong>{{ data.retention.repeatPurchaseChurned }}</strong><span>Продлевали, но ушли</span><small>от не продливших</small></div>
          </article>
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
            <article v-for="row in data.retention.byProducts" :key="row.key" class="admin-finance-churn-row">
              <AdminFinanceRing :percent="row.churnedPercent" :value="valuePercent(row.churnedPercent)" :label="`Отток ${row.title}`" :caption="`${row.churnedCustomers} из ${row.totalCustomers}`" tone="danger" size="compact" />
              <div><strong>{{ row.title }}</strong><small>{{ row.churnedCustomers }} не продлили из {{ row.totalCustomers }}</small></div>
            </article>
          </div>
          <div v-if="data.retention.byProviders.length" class="admin-finance-retention-group">
            <h5>Отток по платёжной системе</h5>
            <article v-for="row in data.retention.byProviders" :key="row.key" class="admin-finance-churn-row">
              <AdminFinanceRing :percent="row.churnedPercent" :value="valuePercent(row.churnedPercent)" :label="`Отток ${row.title}`" :caption="`${row.churnedCustomers} из ${row.totalCustomers}`" tone="danger" size="compact" />
              <div><strong>{{ row.title }}</strong><small>{{ row.churnedCustomers }} не продлили из {{ row.totalCustomers }}</small></div>
            </article>
          </div>
        </div>
      </template>
      <p v-else class="admin-empty">Платящих клиентов пока нет.</p>
    </section>
  </template>
</template>
