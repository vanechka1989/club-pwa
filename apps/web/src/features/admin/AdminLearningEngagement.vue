<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { LearningEngagementResponse, LearningEngagementUsersResponse } from "@club/shared";
import { ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Eye, FileCheck2, Users, Zap } from "lucide-vue-next";
import { getAdminLearningEngagement, getAdminLearningEngagementUsers } from "@/api/client";
import { createShowcaseAnalytics } from "./showcaseAnalytics";

const props = defineProps<{ from?: string; to?: string; demoSeed?: number | undefined }>();
const emit = defineEmits<{ client: [telegramId: string] }>();

const dashboard = ref<LearningEngagementResponse | null>(null);
const drilldown = ref<LearningEngagementUsersResponse | null>(null);
const loading = ref(false);
const loadingUsers = ref(false);
const error = ref("");

function options() {
  return { ...(props.from ? { from: props.from } : {}), ...(props.to ? { to: props.to } : {}) };
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} сек.`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} ч ${minutes} мин` : `${minutes} мин ${seconds % 60} сек`;
}

function viewedAt(value: string) {
  return new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function load() {
  loading.value = true;
  error.value = "";
  drilldown.value = null;
  try {
    if (props.demoSeed !== undefined) {
      const to = props.to ?? new Date().toISOString().slice(0, 10);
      const from = props.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      dashboard.value = createShowcaseAnalytics(props.demoSeed, { from, to }).learning;
    } else {
      dashboard.value = await getAdminLearningEngagement(options());
    }
  } catch {
    error.value = "Не удалось загрузить статистику";
  } finally {
    loading.value = false;
  }
}

async function loadUsers(card: LearningEngagementResponse["cards"][number]) {
  loadingUsers.value = true;
  error.value = "";
  try {
    if (props.demoSeed !== undefined) {
      const to = props.to ?? new Date().toISOString().slice(0, 10);
      const from = props.from ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
      const snapshot = createShowcaseAnalytics(props.demoSeed, { from, to });
      drilldown.value = {
        item: { id: card.contentItemId, title: card.title, categoryTitle: card.categoryTitle },
        users: snapshot.stats.users.slice(0, card.viewers).map((user, index) => ({
          userId: user.id,
          telegramId: user.telegramId,
          displayName: user.firstName ?? `Демо-клиент ${index + 1}`,
          email: null,
          personalDataRestricted: false,
          opens: 1 + index % 4,
          totalActiveSeconds: card.averageActiveSeconds + index * 7,
          videoSeconds: card.videoSeconds ? Math.round(card.videoSeconds / Math.max(1, card.viewers)) : 0,
          playbackPositionSeconds: 0,
          lastViewedAt: card.lastViewedAt,
          completed: index < card.completedUsers
        }))
      };
    } else {
      drilldown.value = await getAdminLearningEngagementUsers(card.contentItemId, options());
    }
  } catch {
    error.value = "Не удалось загрузить статистику";
  } finally {
    loadingUsers.value = false;
  }
}

onMounted(load);
watch(() => [props.from, props.to, props.demoSeed], load);
</script>

<template>
  <div class="admin-learning-engagement admin-learning-dashboard">
    <button v-if="drilldown" class="admin-learning-back ui-button" type="button" @click="drilldown = null">
      <ArrowLeft aria-hidden="true" /> К карточкам
    </button>

    <template v-if="!drilldown">
      <section v-if="dashboard" class="admin-learning-overview-card ui-card" aria-label="Сводка просмотров обучения">
        <header class="admin-learning-section-head">
          <div><strong>Обзор активности</strong><small>Как клиенты изучают материалы</small></div>
          <b>{{ dashboard.cards.length }} материалов</b>
        </header>
        <div class="admin-learning-overview-metrics">
          <article><Users aria-hidden="true" /><span>Уникальные зрители</span><strong>{{ dashboard.summary.uniqueViewers }}</strong></article>
          <article><Eye aria-hidden="true" /><span>Открытия</span><strong>{{ dashboard.summary.views }}</strong></article>
          <article><Clock3 aria-hidden="true" /><span>Медиана</span><strong>{{ duration(dashboard.summary.medianActiveSeconds) }}</strong></article>
          <article><Zap aria-hidden="true" /><span>Быстрые выходы</span><strong>{{ dashboard.summary.quickExitPercent }}%</strong></article>
        </div>
      </section>

      <section v-if="dashboard" class="admin-learning-assessment-summary ui-card" aria-label="Тесты и домашние задания">
        <header><ClipboardCheck aria-hidden="true" /><div><strong>Тесты и домашние задания</strong><small>Результаты за выбранный период</small></div></header>
        <div>
          <article><FileCheck2 aria-hidden="true" /><span>ДЗ отправлено</span><strong>{{ dashboard.assessments.homeworkSubmitted }}</strong></article>
          <article><CheckCircle2 aria-hidden="true" /><span>ДЗ принято</span><strong>{{ dashboard.assessments.homeworkAccepted }}</strong></article>
          <article><Clock3 aria-hidden="true" /><span>Ждут проверки</span><strong>{{ dashboard.assessments.homeworkPendingReview }}</strong></article>
          <article><ClipboardCheck aria-hidden="true" /><span>Тесты пройдены</span><strong>{{ dashboard.assessments.quizPassed }} / {{ dashboard.assessments.quizSubmitted }}</strong></article>
        </div>
        <p v-if="dashboard.assessments.homeworkNeedsRevision">На доработке: {{ dashboard.assessments.homeworkNeedsRevision }}</p>
      </section>

      <p v-if="loading" class="admin-learning-state">Загружаем просмотры…</p>
      <div v-else-if="error" class="admin-learning-state admin-learning-state-error"><p>{{ error }}</p><button class="ui-button" type="button" @click="load">Повторить</button></div>
      <p v-else-if="dashboard && !dashboard.cards.length" class="admin-learning-state">Данные появятся после новых просмотров карточек.</p>

      <section v-else-if="dashboard" class="admin-learning-materials" aria-label="Материалы обучения">
        <header class="admin-learning-materials-head">
          <div><h4>Материалы</h4><p>Активность по каждой карточке</p></div>
          <strong>{{ dashboard.cards.length }}</strong>
        </header>
        <div class="admin-learning-engagement-list">
          <button v-for="card in dashboard.cards" :key="card.contentItemId" class="admin-learning-engagement-card ui-button" type="button" @click="loadUsers(card)">
            <header><div><small>{{ card.categoryTitle }}</small><strong>{{ card.title }}</strong></div><ChevronRight aria-hidden="true" /></header>
            <div class="admin-learning-card-metrics">
              <span><small>Зрители</small><b>{{ card.viewers }}</b></span>
              <span><small>Открытия</small><b>{{ card.views }}</b></span>
              <span><small>Среднее время</small><b>{{ duration(card.averageActiveSeconds) }}</b></span>
              <span class="admin-learning-quick-exit-metric"><small>Быстрые выходы</small><b>{{ card.quickExitPercent }}%</b><i class="admin-learning-quick-exit-bar" aria-hidden="true"><span :style="{ width: `max(4px, ${card.quickExitPercent}%)` }"></span></i></span>
            </div>
            <footer>
              <span><b>{{ card.engagedViews }}</b><small>активных</small></span>
              <span><b>{{ card.completedUsers }}</b><small>завершили</small></span>
              <span v-if="card.videoSeconds"><b>{{ duration(card.videoSeconds) }}</b><small>видео</small></span>
            </footer>
          </button>
        </div>
      </section>
    </template>

    <template v-else>
      <header class="admin-learning-drilldown-head"><small>{{ drilldown.item.categoryTitle }}</small><h4>{{ drilldown.item.title }}</h4><p>Активность учеников по выбранной карточке.</p></header>
      <p v-if="loadingUsers" class="admin-learning-state">Загружаем просмотры…</p>
      <p v-else-if="!drilldown.users.length" class="admin-learning-state">У этой карточки пока нет просмотров.</p>
      <div v-else class="admin-learning-user-list">
        <button v-for="user in drilldown.users" :key="user.userId" class="admin-learning-user ui-button" type="button" @click="emit('client', user.telegramId)">
          <div><strong>{{ user.displayName }}</strong><small>{{ user.personalDataRestricted ? "Скрыто владельцем" : (user.email || `ID ${user.telegramId}`) }}</small></div>
          <div class="admin-learning-user-metrics"><span>{{ user.opens }} откр.</span><span>{{ duration(user.totalActiveSeconds) }}</span><span>{{ viewedAt(user.lastViewedAt) }}</span></div>
          <b :class="{ 'is-completed': user.completed }">{{ user.completed ? "Завершил" : "Не завершил" }}</b>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </template>
  </div>
</template>

<style src="./adminLearningEngagement.css"></style>
