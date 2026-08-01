<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { LearningEngagementResponse, LearningEngagementUsersResponse } from "@club/shared";
import { ArrowLeft, CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Eye, FileCheck2, Users, Zap } from "lucide-vue-next";
import { getAdminLearningEngagement, getAdminLearningEngagementUsers } from "@/api/client";

const props = defineProps<{ from?: string; to?: string }>();
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
    dashboard.value = await getAdminLearningEngagement(options());
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
    drilldown.value = await getAdminLearningEngagementUsers(card.contentItemId, options());
  } catch {
    error.value = "Не удалось загрузить статистику";
  } finally {
    loadingUsers.value = false;
  }
}

onMounted(load);
watch(() => [props.from, props.to], load);
</script>

<template>
  <div class="admin-learning-engagement">
    <button v-if="drilldown" class="admin-learning-back ui-button" type="button" @click="drilldown = null">
      <ArrowLeft aria-hidden="true" /> К карточкам
    </button>

    <template v-if="!drilldown">
      <div v-if="dashboard" class="admin-learning-engagement-kpis" aria-label="Сводка просмотров обучения">
        <article><Users aria-hidden="true" /><span>Уникальные зрители</span><strong>{{ dashboard.summary.uniqueViewers }}</strong></article>
        <article><Eye aria-hidden="true" /><span>Открытия</span><strong>{{ dashboard.summary.views }}</strong></article>
        <article><Clock3 aria-hidden="true" /><span>Медианное время</span><strong>{{ duration(dashboard.summary.medianActiveSeconds) }}</strong></article>
        <article><Zap aria-hidden="true" /><span>Быстрые выходы</span><strong>{{ dashboard.summary.quickExitPercent }}%</strong></article>
      </div>

      <section v-if="dashboard" class="admin-learning-assessment-summary" aria-label="Тесты и домашние задания">
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

      <div v-else-if="dashboard" class="admin-learning-engagement-list">
        <button v-for="card in dashboard.cards" :key="card.contentItemId" class="admin-learning-engagement-card ui-button" type="button" @click="loadUsers(card)">
          <header><div><small>{{ card.categoryTitle }}</small><strong>{{ card.title }}</strong></div><ChevronRight aria-hidden="true" /></header>
          <div class="admin-learning-card-metrics">
            <span><small>Зрители</small><b>{{ card.viewers }}</b></span>
            <span><small>Открытия</small><b>{{ card.views }}</b></span>
            <span><small>Среднее время</small><b>{{ duration(card.averageActiveSeconds) }}</b></span>
            <span><small>Быстрые выходы</small><b>{{ card.quickExitPercent }}%</b></span>
          </div>
          <footer><span>Активных просмотров: {{ card.engagedViews }}</span><span>Завершили: {{ card.completedUsers }}</span><span v-if="card.videoSeconds">Видео: {{ duration(card.videoSeconds) }}</span></footer>
        </button>
      </div>
    </template>

    <template v-else>
      <header class="admin-learning-drilldown-head"><small>{{ drilldown.item.categoryTitle }}</small><h4>{{ drilldown.item.title }}</h4><p>Активность учеников по выбранной карточке.</p></header>
      <p v-if="loadingUsers" class="admin-learning-state">Загружаем просмотры…</p>
      <p v-else-if="!drilldown.users.length" class="admin-learning-state">У этой карточки пока нет просмотров.</p>
      <div v-else class="admin-learning-user-list">
        <button v-for="user in drilldown.users" :key="user.userId" class="admin-learning-user ui-button" type="button" @click="emit('client', user.telegramId)">
          <div><strong>{{ user.displayName }}</strong><small>{{ user.email || `ID ${user.telegramId}` }}</small></div>
          <div class="admin-learning-user-metrics"><span>{{ user.opens }} откр.</span><span>{{ duration(user.totalActiveSeconds) }}</span><span>{{ viewedAt(user.lastViewedAt) }}</span></div>
          <b :class="{ 'is-completed': user.completed }">{{ user.completed ? "Завершил" : "Не завершил" }}</b>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </template>
  </div>
</template>

<style src="./adminLearningEngagement.css"></style>
<style scoped>
.admin-learning-assessment-summary{display:grid;gap:12px;margin:14px 0;padding:15px;border:1px solid rgba(49,221,185,.22);border-radius:19px;background:rgba(7,62,51,.48)}.admin-learning-assessment-summary>header{display:flex;align-items:center;gap:10px}.admin-learning-assessment-summary>header>svg{width:23px;color:#32ddba}.admin-learning-assessment-summary>header>div{display:grid;gap:2px}.admin-learning-assessment-summary small{color:#9eb5af}.admin-learning-assessment-summary>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.admin-learning-assessment-summary article{display:grid;grid-template-columns:20px 1fr auto;align-items:center;gap:7px;padding:10px;border-radius:13px;background:rgba(0,0,0,.13)}.admin-learning-assessment-summary article svg{width:18px;color:#37d9b7}.admin-learning-assessment-summary article span{color:#b8cbc6;font-size:.76rem}.admin-learning-assessment-summary article strong{font-size:1rem}.admin-learning-assessment-summary>p{margin:0;color:#f3c979;font-size:.8rem}
</style>
