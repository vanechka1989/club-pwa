<script setup lang="ts">
import type { AdminUserDetailResponse } from "@club/shared";
import { BookOpen, CheckCircle2, ChevronRight, Clock3, ClipboardCheck } from "lucide-vue-next";
import { computed, ref } from "vue";

type Engagement = AdminUserDetailResponse["learningEngagement"][number];
type Assessment = AdminUserDetailResponse["learningAssessments"][number];
type Filter = "all" | "lessons" | "assessments";

const props = defineProps<{
  engagement: readonly Engagement[];
  assessments: readonly Assessment[];
  canManage: boolean;
  formatDuration: (seconds: number) => string;
  formatDate: (value: string) => string;
}>();

const emit = defineEmits<{
  "open-result": [value: { mode: "quiz" | "homework"; recordId: string }];
}>();

const filter = ref<Filter>("all");
const totalSeconds = computed(() => props.engagement.reduce((sum, item) => sum + item.totalActiveSeconds, 0));
const pendingReviews = computed(() => props.assessments.filter((item) => item.status === "pending_review").length);
const visibleEvents = computed(() => {
  const lessons = props.engagement.map((item) => ({ kind: "lesson" as const, date: item.lastViewedAt, item }));
  const assessments = props.assessments.map((item) => ({
    kind: "assessment" as const,
    date: item.submittedAt ?? item.reviewedAt ?? item.resetAt ?? "",
    item
  }));
  const events = filter.value === "lessons" ? lessons : filter.value === "assessments" ? assessments : [...lessons, ...assessments];
  return events.sort((left, right) => right.date.localeCompare(left.date));
});

function plural(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${count} ${word}`;
}

function assessmentStatusLabel(item: Assessment) {
  const labels: Record<string, string> = {
    passed: "Тест пройден",
    failed: "Тест не пройден",
    pending_review: "Ждёт проверки",
    accepted: "ДЗ принято",
    needs_revision: item.resetAt ? "Прохождение сброшено" : "Нужна доработка",
    in_progress: "В процессе",
    draft: "Черновик"
  };
  return labels[item.status] ?? item.status;
}

function assessmentResultLabel(item: Assessment) {
  return item.mode === "quiz"
    ? `${item.percent ?? 0}% · ${item.earnedPoints ?? 0}/${item.maxPoints ?? 0} баллов · попытка ${item.attemptNumber ?? 1}`
    : `Версия ${item.version ?? 1}`;
}

function openAssessment(item: Assessment) {
  if (!props.canManage) return;
  emit("open-result", { mode: item.mode, recordId: item.recordId });
}
</script>

<template>
  <section class="admin-client-learning admin-client-detail-surface" aria-label="Обучение">
    <div class="admin-client-learning__body">
      <div class="admin-client-learning__summary" aria-label="Сводка обучения">
        <article><BookOpen aria-hidden="true" /><span>Уроки<strong>{{ plural(engagement.length, 'урок', 'урока', 'уроков') }}</strong></span></article>
        <article><Clock3 aria-hidden="true" /><span>Время<strong>{{ formatDuration(totalSeconds) }}</strong></span></article>
        <article><CheckCircle2 aria-hidden="true" /><span>Результаты<strong>{{ plural(assessments.length, 'результат', 'результата', 'результатов') }}</strong></span></article>
        <article v-if="pendingReviews"><ClipboardCheck aria-hidden="true" /><span>На проверке<strong>{{ pendingReviews }}</strong></span></article>
      </div>

      <div class="admin-client-learning__filters" aria-label="Фильтр обучения">
        <button v-for="option in ([['all', 'Все'], ['lessons', 'Уроки'], ['assessments', 'Тесты и ДЗ']] as const)" :key="option[0]" type="button" :aria-pressed="filter === option[0]" @click="filter = option[0]">{{ option[1] }}</button>
      </div>

      <div class="admin-client-learning__events">
        <p v-if="!visibleEvents.length" class="admin-empty">Данных по выбранному разделу пока нет.</p>
        <template v-for="event in visibleEvents" :key="event.kind === 'lesson' ? event.item.contentItemId : `${event.item.mode}-${event.item.recordId}`">
          <article v-if="event.kind === 'lesson'" class="admin-client-learning__event admin-client-learning__event--lesson">
            <span class="admin-client-learning__icon"><BookOpen aria-hidden="true" /></span>
            <div><strong>{{ event.item.title }}</strong><small>{{ event.item.categoryTitle }} · {{ event.item.opens }} открытий</small><p><span>{{ formatDuration(event.item.totalActiveSeconds) }}</span><time>{{ formatDate(event.item.lastViewedAt) }}</time></p></div>
          </article>
          <button v-else class="admin-client-learning__event admin-client-learning__event--assessment" type="button" :disabled="!canManage" :title="canManage ? 'Открыть полный результат' : 'Нет права на просмотр результатов'" :aria-label="`Открыть результат: ${event.item.title}`" @click="openAssessment(event.item)">
            <span class="admin-client-learning__icon"><ClipboardCheck aria-hidden="true" /></span>
            <div><strong>{{ event.item.title }}</strong><small>{{ event.item.categoryTitle }} · {{ event.item.mode === 'quiz' ? 'Тест' : 'Домашнее задание' }}</small><p><span>{{ assessmentResultLabel(event.item) }}</span><time v-if="event.item.submittedAt">{{ formatDate(event.item.submittedAt) }}</time></p><em :class="`status-${event.item.status}`">{{ assessmentStatusLabel(event.item) }}</em></div>
            <ChevronRight aria-hidden="true" />
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin-client-learning { min-width: 0; }
.admin-client-learning__body { display: grid; gap: 8px; }
.admin-client-learning__summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
.admin-client-learning__summary article { display: grid; grid-template-columns: 16px minmax(0, 1fr); align-items: center; gap: 2px 7px; min-width: 0; min-height: 52px; padding: 7px 9px; border-left: 1px solid var(--border); }
.admin-client-learning__summary article:first-child { border-left: 0; }
.admin-client-learning__summary svg { grid-row: 1 / 3; width: 16px; flex: 0 0 auto; color: var(--accent); }
.admin-client-learning__summary span { display: grid; min-width: 0; color: var(--text-muted); font-size: 10px; line-height: 1.15; }
.admin-client-learning__summary strong { overflow: hidden; color: var(--text); font-size: 12px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.admin-client-learning__filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 3px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-soft); }
.admin-client-learning__filters button { min-height: 44px; padding: 0 6px; border: 0; border-radius: 9px; color: var(--text-muted); background: transparent; font: inherit; font-size: 11px; font-weight: 700; }
.admin-client-learning__filters button[aria-pressed="true"] { color: var(--accent-text); background: var(--accent); box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 18%, transparent); }
.admin-client-learning__events { display: grid; gap: 8px; }
.admin-client-learning__event { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 9px; min-height: 56px; width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 12px; color: inherit; text-align: left; background: var(--surface); }
button.admin-client-learning__event { cursor: pointer; font: inherit; }
button.admin-client-learning__event:disabled { cursor: not-allowed; opacity: .62; }
.admin-client-learning__event > div { display: grid; gap: 2px; min-width: 0; }
.admin-client-learning__event strong, .admin-client-learning__event small, .admin-client-learning__event em { min-width: 0; overflow-wrap: anywhere; }
.admin-client-learning__event strong { font-size: 13px; line-height: 1.2; }
.admin-client-learning__event small { color: var(--text-muted); font-size: 10px; line-height: 1.25; }
.admin-client-learning__event p { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 3px 10px; margin: 2px 0 0; color: var(--text-muted); font-size: 10px; line-height: 1.25; }
.admin-client-learning__event em { width: max-content; margin-top: 2px; color: var(--accent); font-size: 11px; font-style: normal; font-weight: 700; line-height: 1.25; }
.admin-client-learning__event > svg { width: 16px; color: var(--accent); }
.admin-client-learning__icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.admin-client-learning__icon svg { width: 16px; }
@media (max-width: 359px) {
  .admin-client-learning__summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .admin-client-learning__summary article:nth-child(odd) { border-left: 0; }
  .admin-client-learning__summary article:nth-child(n + 3) { border-top: 1px solid var(--border); }
  .admin-client-learning__filters button { font-size: 10px; }
}
@media (min-width: 720px) {
  .admin-client-learning__body { gap: 10px; }
  .admin-client-learning__event { padding-inline: 12px; }
}
</style>
