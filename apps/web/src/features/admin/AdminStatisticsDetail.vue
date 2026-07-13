<script setup lang="ts">
import type { AdminStatsResponse } from "@club/shared";
import type { AdminStatistics } from "./adminStatistics";
import type { AdminAccessBreakdownItem } from "./adminUserDrilldown";
import type { AdminPaymentBreakdownItem } from "./adminPaymentDrilldown";
import { ChevronRight } from "lucide-vue-next";
import AdminPollStatistics from "./AdminPollStatistics.vue";

export type StatisticsDetail = "clients" | "finance" | "learning" | "community" | "polls";

defineProps<{
  detail: StatisticsDetail;
  stats: AdminStatistics;
  pollStats: AdminStatsResponse["pollStats"];
}>();

defineEmits<{
  access: [item: AdminAccessBreakdownItem];
  tariff: [item: { tariff: string; label: string; value: number }];
  payment: [item: AdminPaymentBreakdownItem];
}>();
</script>

<template>
  <div class="admin-stat-detail">
    <template v-if="detail === 'clients'">
      <section class="admin-stat-detail-hero ui-card">
        <div><span>Активный доступ</span><strong>{{ stats.clients.active }} из {{ stats.clients.total }}</strong></div>
        <b>{{ stats.clients.activePercent }}%</b>
        <div class="admin-stat-meter"><span :style="{ width: `${stats.clients.activePercent}%` }"></span></div>
        <small>Состояние на сегодня</small>
      </section>
      <section class="admin-stat-detail-card ui-card">
        <header><div><h4>Состояние доступа</h4><p>Нажмите на показатель, чтобы открыть список клиентов.</p></div></header>
        <div class="admin-stat-detail-grid">
          <button v-for="item in stats.clients.accessBreakdown" :key="item.key" class="admin-stat-drilldown ui-button" type="button" :disabled="!item.value" @click="$emit('access', item)">
            <span>{{ item.label }}</span><strong>{{ item.value }}</strong><span class="admin-stat-metric-chevron" :class="{ 'is-hidden': !item.value }"><ChevronRight aria-hidden="true" /></span>
          </button>
        </div>
      </section>
      <section class="admin-stat-detail-card ui-card">
        <header><div><h4>Тарифы</h4><p>Распределение всей клиентской базы.</p></div></header>
        <div class="admin-stat-detail-grid">
          <button v-for="tariff in stats.tariffs" :key="tariff.tariff" class="admin-stat-drilldown ui-button" type="button" :disabled="!tariff.value" @click="$emit('tariff', tariff)">
            <span>{{ tariff.label }}</span><strong>{{ tariff.value }}</strong><span class="admin-stat-metric-chevron" :class="{ 'is-hidden': !tariff.value }"><ChevronRight aria-hidden="true" /></span>
          </button>
        </div>
      </section>
    </template>

    <template v-if="detail === 'finance'">
      <section class="admin-stat-detail-hero ui-card">
        <div><span>Выручка за выбранный период</span><strong>{{ stats.payments.revenueRub.toLocaleString('ru-RU') }} ₽</strong></div>
        <b>{{ stats.payments.paidOrders }} оплат</b>
        <small>Средний чек {{ stats.payments.averagePaidOrderRub.toLocaleString('ru-RU') }} ₽</small>
      </section>
      <section class="admin-stat-detail-card ui-card">
        <header><div><h4>Операции</h4><p>Нажмите на показатель, чтобы открыть связанные платежи.</p></div></header>
        <div class="admin-stat-detail-grid">
          <button v-for="item in stats.payments.breakdown" :key="item.key" class="admin-stat-drilldown ui-button" type="button" :disabled="!item.value" @click="$emit('payment', item)">
            <span>{{ item.label }}</span><strong>{{ item.value }}</strong><span class="admin-stat-metric-chevron" :class="{ 'is-hidden': !item.value }"><ChevronRight aria-hidden="true" /></span>
          </button>
        </div>
      </section>
    </template>

    <template v-if="detail === 'learning'">
      <section class="admin-stat-detail-hero ui-card">
        <div><span>Средний прогресс</span><strong>{{ stats.learning.averageProgressPercent }}%</strong></div>
        <b>{{ stats.learning.completedItems }} / {{ stats.learning.totalItems }}</b>
        <div class="admin-stat-meter"><span :style="{ width: `${stats.learning.averageProgressPercent}%` }"></span></div>
        <small>Состояние на сегодня</small>
      </section>
      <section class="admin-stat-detail-card ui-card">
        <header><div><h4>Материалы</h4><p>{{ stats.learning.categoriesCount }} разделов обучения.</p></div></header>
        <div class="admin-stat-detail-grid">
          <article><span>Опубликовано</span><strong>{{ stats.learning.publishedMaterials }}</strong></article>
          <article><span>Скрыто</span><strong>{{ stats.learning.hiddenMaterials }}</strong></article>
          <article><span>Архив</span><strong>{{ stats.learning.archivedMaterials }}</strong></article>
        </div>
        <div class="admin-stat-popular-material">
          <span>Чаще открывают</span>
          <strong>{{ stats.learning.popularTitle || "Пока нет данных по открытиям" }}</strong>
        </div>
        <div class="admin-stat-content-kinds"><span v-for="kind in stats.contentKinds" :key="kind.kind"><strong>{{ kind.label }}</strong><b>{{ kind.count }}</b></span></div>
      </section>
    </template>

    <template v-if="detail === 'community'">
      <section class="admin-stat-detail-hero ui-card">
        <div><span>Сообщения за выбранный период</span><strong>{{ stats.communication.messagesInPeriod }}</strong></div>
        <b>{{ stats.communication.activeWriters }} авторов</b>
        <small>Всего в клубе {{ stats.communication.messages }} сообщений</small>
      </section>
      <section class="admin-stat-detail-card ui-card">
        <header><div><h4>Активность</h4><p>Темы клуба и общение клиентов.</p></div></header>
        <div class="admin-stat-detail-grid">
          <article><span>Темы</span><strong>{{ stats.communication.topics }}</strong></article>
          <article><span>Открыты</span><strong>{{ stats.communication.openTopics }}</strong></article>
          <article><span>Закрыты</span><strong>{{ stats.communication.lockedTopics }}</strong></article>
          <article><span>За 30 дней</span><strong>{{ stats.communication.messagesLast30Days }}</strong></article>
        </div>
        <div class="admin-stat-hot-topic">
          <span>Горячая тема</span>
          <strong>{{ stats.communication.hotTopic?.title || "Пока нет сообщений" }}</strong>
          <small v-if="stats.communication.hotTopic">{{ stats.communication.hotTopic.messages }} сообщений за период</small>
        </div>
        <div class="admin-stat-community-ranking">
          <h5>Активные участники</h5>
          <article v-for="client in stats.communication.topClients" :key="client.telegramId"><span>{{ client.name }}</span><strong>{{ client.messages }}</strong></article>
          <p v-if="!stats.communication.topClients.length" class="admin-empty">Активных клиентов в общении пока нет.</p>
        </div>
      </section>
    </template>

    <AdminPollStatistics v-if="detail === 'polls'" :stats="pollStats" />
  </div>
</template>
