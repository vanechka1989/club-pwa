<script setup lang="ts">
import { Check, CircleAlert, FileText, Paperclip, RotateCcw, X } from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { getAdminAssessmentResult, type AdminAssessmentResult, type AdminQuizAssessmentResult } from "@/api/client";
import TaskScreen from "@/features/app/TaskScreen.vue";

const props = defineProps<{
  telegramId: string;
  mode: "quiz" | "homework";
  recordId: string;
  clientName: string;
  canReset: boolean;
  formatDate: (value: string) => string;
}>();

const emit = defineEmits<{
  back: [];
  reset: [value: { mode: "quiz" | "homework"; recordId: string }];
}>();

const result = ref<AdminAssessmentResult | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const title = computed(() => result.value?.mode === "homework" ? "Результат домашнего задания" : "Результат теста");
const resetAvailable = computed(() => {
  if (!props.canReset || !result.value || result.value.resetAt) return false;
  return result.value.mode === "quiz" ? ["passed", "failed"].includes(result.value.status) : result.value.status === "accepted";
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    result.value = (await getAdminAssessmentResult(props.telegramId, props.mode, props.recordId)).result;
  } catch {
    error.value = "Не удалось загрузить результат. Попробуйте ещё раз.";
  } finally {
    loading.value = false;
  }
}

function optionClass(question: AdminQuizAssessmentResult["questions"][number], optionId: string) {
  return {
    selected: question.selectedOptionIds.includes(optionId),
    correct: question.correctOptionIds.includes(optionId),
    incorrect: question.selectedOptionIds.includes(optionId) && !question.correctOptionIds.includes(optionId)
  };
}

function statusLabel(value: string) {
  return ({ passed: "Тест пройден", failed: "Тест не пройден", pending_review: "Ждёт проверки", accepted: "ДЗ принято", needs_revision: "Нужна доработка", in_progress: "В процессе", draft: "Черновик" } as Record<string, string>)[value] ?? value;
}

function reviewDecisionLabel(value: string | null) {
  if (value === "accepted") return "Принято";
  if (value === "needs_revision") return "На доработку";
  return "Не проверено";
}

watch(() => [props.telegramId, props.mode, props.recordId], load);
onMounted(load);
</script>

<template>
  <TaskScreen class="admin-task-screen admin-assessment-result-task" :title="title" :subtitle="clientName" portal @back="emit('back')">
    <div class="admin-assessment-result">
      <section v-if="loading" class="admin-assessment-state ui-card">Загружаю полный результат…</section>
      <section v-else-if="error" class="admin-assessment-state admin-assessment-state--error ui-card"><CircleAlert aria-hidden="true" /><p>{{ error }}</p><button class="secondary-button ui-button" type="button" @click="load">Повторить</button></section>
      <template v-else-if="result">
        <header class="admin-assessment-hero ui-card">
          <div><span>{{ result.categoryTitle }} · {{ result.mode === 'quiz' ? 'Тест' : 'Домашнее задание' }}</span><h3>{{ result.title }}</h3><p>{{ statusLabel(result.status) }}</p></div>
          <strong v-if="result.mode === 'quiz'">{{ result.percent ?? 0 }}%</strong>
          <FileText v-else aria-hidden="true" />
        </header>

        <section v-if="result.mode === 'quiz'" class="admin-assessment-summary" aria-label="Итог теста">
          <article><span>Баллы</span><strong>{{ result.earnedPoints ?? 0 }} из {{ result.maxPoints ?? 0 }} баллов</strong></article>
          <article><span>Попытка</span><strong>{{ result.attemptNumber }}</strong></article>
          <article><span>Проходной результат</span><strong>{{ result.passingPercent ?? 0 }}%</strong></article>
          <article v-if="result.submittedAt"><span>Сдано</span><strong>{{ formatDate(result.submittedAt) }}</strong></article>
        </section>
        <section v-else class="admin-assessment-summary" aria-label="Итог домашнего задания">
          <article><span>Версия</span><strong>Версия {{ result.version }}</strong></article>
          <article><span>Решение</span><strong>{{ reviewDecisionLabel(result.reviewDecision) }}</strong></article>
          <article v-if="result.submittedAt"><span>Сдано</span><strong>{{ formatDate(result.submittedAt) }}</strong></article>
          <article v-if="result.reviewedAt"><span>Проверено</span><strong>{{ formatDate(result.reviewedAt) }}</strong></article>
        </section>

        <section v-if="result.reviewComment" class="admin-assessment-comment ui-card"><strong>Комментарий проверяющего</strong><p>{{ result.reviewComment }}</p></section>

        <section v-if="result.mode === 'quiz'" class="admin-assessment-questions">
          <article v-for="(question, index) in result.questions" :key="question.id" class="admin-assessment-question ui-card">
            <header><span>Вопрос {{ index + 1 }}</span><em :class="question.isCorrect === null ? 'reviewed' : question.isCorrect ? 'correct' : 'incorrect'">{{ question.isCorrect === null ? 'Проверено администратором · ' : '' }}{{ question.earnedPoints ?? 0 }} / {{ question.points }} баллов</em></header>
            <h4>{{ question.prompt }}</h4>
            <div v-if="question.type !== 'free_text'" class="admin-assessment-options">
              <div v-for="option in question.optionsSnapshot" :key="option.id" :class="optionClass(question, option.id)">
                <span><Check v-if="question.correctOptionIds.includes(option.id)" aria-hidden="true" /><X v-else-if="question.selectedOptionIds.includes(option.id)" aria-hidden="true" /></span>
                <strong>{{ option.text }}</strong>
                <small v-if="question.selectedOptionIds.includes(option.id)">Ответ клиента</small>
                <small v-if="question.correctOptionIds.includes(option.id)">Правильный ответ</small>
              </div>
            </div>
            <div v-else class="admin-assessment-free-text"><span>Ответ клиента</span><p>{{ question.text || 'Ответ не указан' }}</p></div>
          </article>
        </section>

        <template v-else>
          <section v-if="result.prompt" class="admin-assessment-text ui-card"><span>Задание</span><p>{{ result.prompt }}</p></section>
          <section class="admin-assessment-text ui-card"><span>Ответ клиента · версия {{ result.version }}</span><p>{{ result.text || 'Текстовый ответ не указан' }}</p></section>
          <section v-if="result.attachments.length" class="admin-assessment-files ui-card"><strong>Файлы клиента</strong><a v-for="file in result.attachments" :key="file.id" :href="file.url" target="_blank" rel="noopener noreferrer"><Paperclip aria-hidden="true" /><span>{{ file.fileName }}<small>{{ Math.max(1, Math.round(file.sizeBytes / 1024)) }} КБ</small></span></a></section>
        </template>

        <section v-if="result.resetAt" class="admin-assessment-reset-history ui-card"><RotateCcw aria-hidden="true" /><div><strong>Прохождение было сброшено</strong><p>{{ formatDate(result.resetAt) }}<template v-if="result.resetReason"> · {{ result.resetReason }}</template></p></div></section>
        <button v-if="resetAvailable" class="admin-assessment-reset-button secondary-button ui-button" type="button" @click="emit('reset', { mode: result.mode, recordId: result.id })"><RotateCcw aria-hidden="true" />Сбросить результат</button>
      </template>
    </div>
  </TaskScreen>
</template>

<style scoped>
.admin-assessment-result { display: grid; gap: 12px; padding-bottom: 24px; }
.admin-assessment-state { display: grid; min-height: 160px; place-items: center; padding: 22px; color: var(--text-muted); text-align: center; }
.admin-assessment-state--error svg { width: 30px; color: var(--danger); }
.admin-assessment-hero { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 15%, var(--surface)), var(--surface)); }
.admin-assessment-hero div { display: grid; gap: 4px; min-width: 0; }
.admin-assessment-hero span { color: var(--text-muted); font-size: 12px; }
.admin-assessment-hero h3, .admin-assessment-hero p { margin: 0; }
.admin-assessment-hero p { color: var(--accent); font-weight: 700; }
.admin-assessment-hero > strong { font-size: 34px; color: var(--accent); }
.admin-assessment-hero > svg { width: 38px; color: var(--accent); }
.admin-assessment-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.admin-assessment-summary article { display: grid; gap: 4px; padding: 13px; border: 1px solid var(--border); border-radius: 15px; background: var(--panel-soft); }
.admin-assessment-summary span, .admin-assessment-text span { color: var(--text-muted); font-size: 11px; }
.admin-assessment-summary strong { font-size: 13px; }
.admin-assessment-comment, .admin-assessment-text, .admin-assessment-files, .admin-assessment-reset-history { padding: 16px; }
.admin-assessment-comment p, .admin-assessment-text p, .admin-assessment-reset-history p { margin: 7px 0 0; white-space: pre-wrap; }
.admin-assessment-questions { display: grid; gap: 10px; }
.admin-assessment-question { display: grid; gap: 12px; padding: 16px; }
.admin-assessment-question header { display: flex; justify-content: space-between; gap: 8px; color: var(--text-muted); font-size: 12px; }
.admin-assessment-question header em { font-style: normal; font-weight: 700; }
.admin-assessment-question header em.correct { color: var(--accent); }
.admin-assessment-question header em.incorrect { color: var(--danger); }
.admin-assessment-question header em.reviewed { color: var(--text-muted); }
.admin-assessment-question h4 { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.admin-assessment-options { display: grid; gap: 7px; }
.admin-assessment-options > div { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 3px 9px; align-items: center; min-width: 0; padding: 10px; border: 1px solid var(--border); border-radius: 13px; }
.admin-assessment-options strong, .admin-assessment-options small, .admin-assessment-free-text p, .admin-assessment-text p, .admin-assessment-files span { min-width: 0; overflow-wrap: anywhere; }
.admin-assessment-options > div > span { display: grid; grid-row: 1 / span 3; width: 28px; height: 28px; place-items: center; border-radius: 50%; background: var(--surface); }
.admin-assessment-options svg { width: 15px; }
.admin-assessment-options small { color: var(--text-muted); }
.admin-assessment-options .correct { border-color: color-mix(in srgb, var(--accent) 55%, transparent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.admin-assessment-options .incorrect { border-color: color-mix(in srgb, var(--danger) 55%, transparent); background: color-mix(in srgb, var(--danger) 9%, transparent); }
.admin-assessment-free-text { padding: 12px; border-radius: 13px; background: var(--panel-soft); }
.admin-assessment-files { display: grid; gap: 9px; }
.admin-assessment-files a { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 11px; border: 1px solid var(--border); border-radius: 13px; color: inherit; text-decoration: none; }
.admin-assessment-files a > span { display: grid; }
.admin-assessment-files small { color: var(--text-muted); }
.admin-assessment-reset-history { display: flex; align-items: center; gap: 12px; color: var(--text-muted); }
.admin-assessment-reset-history svg { width: 22px; flex: 0 0 auto; }
.admin-assessment-reset-button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; }
@media (max-width: 360px) { .admin-assessment-summary { grid-template-columns: 1fr; } }
</style>
