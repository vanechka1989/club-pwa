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
  <details class="admin-client-learning admin-client-section admin-detail ui-card" open>
    <summary>
      <span><BookOpen aria-hidden="true" /><strong>Обучение</strong></span>
      <em>{{ engagement.length + assessments.length }} событий</em>
    </summary>

    <div class="admin-client-learning__body">
      <div class="admin-client-learning__kpis" aria-label="Сводка обучения">
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
  </details>
</template>

<style scoped>
.admin-client-learning { overflow: hidden; }
.admin-client-learning > summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 58px; padding: 0 18px; cursor: pointer; list-style: none; }
.admin-client-learning > summary::-webkit-details-marker { display: none; }
.admin-client-learning > summary > span { display: inline-flex; align-items: center; gap: 10px; }
.admin-client-learning > summary svg { width: 19px; color: var(--accent); }
.admin-client-learning > summary em { color: var(--text-muted); font-size: 12px; font-style: normal; }
.admin-client-learning__body { display: grid; gap: 14px; padding: 0 14px 16px; border-top: 1px solid var(--border); }
.admin-client-learning__kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-top: 14px; }
.admin-client-learning__kpis article { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 11px; border: 1px solid var(--border); border-radius: 15px; background: var(--panel-soft); }
.admin-client-learning__kpis svg { width: 18px; flex: 0 0 auto; color: var(--accent); }
.admin-client-learning__kpis span { display: grid; min-width: 0; color: var(--text-muted); font-size: 11px; }
.admin-client-learning__kpis strong { overflow: hidden; color: var(--text); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.admin-client-learning__filters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 5px; border: 1px solid var(--border); border-radius: 15px; background: var(--panel-soft); }
.admin-client-learning__filters button { min-height: 44px; padding: 0 8px; border: 0; border-radius: 11px; color: var(--text-muted); background: transparent; font: inherit; font-size: 12px; font-weight: 700; }
.admin-client-learning__filters button[aria-pressed="true"] { color: var(--accent-text); background: var(--accent); box-shadow: 0 7px 18px color-mix(in srgb, var(--accent) 22%, transparent); }
.admin-client-learning__events { display: grid; gap: 8px; }
.admin-client-learning__event { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 16px; color: inherit; text-align: left; background: var(--panel-soft); }
button.admin-client-learning__event { cursor: pointer; font: inherit; }
button.admin-client-learning__event:disabled { cursor: not-allowed; opacity: .62; }
.admin-client-learning__event > div { display: grid; gap: 3px; min-width: 0; }
.admin-client-learning__event strong, .admin-client-learning__event small, .admin-client-learning__event em { min-width: 0; overflow-wrap: anywhere; }
.admin-client-learning__event small { color: var(--text-muted); }
.admin-client-learning__event p { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; margin: 4px 0 0; color: var(--text-muted); font-size: 11px; }
.admin-client-learning__event em { width: max-content; margin-top: 4px; color: var(--accent); font-size: 12px; font-style: normal; font-weight: 700; }
.admin-client-learning__event > svg { width: 18px; color: var(--accent); }
.admin-client-learning__icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 13px; color: var(--accent); background: color-mix(in srgb, var(--accent) 13%, transparent); }
.admin-client-learning__icon svg { width: 19px; }
@media (max-width: 420px) { .admin-client-learning__kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .admin-client-learning__filters button { font-size: 11px; } }
</style>
