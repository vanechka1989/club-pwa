<script setup lang="ts">
import { ArrowRight, CheckCircle2, CircleAlert, X } from "lucide-vue-next";
import TaskScreen from "@/features/app/TaskScreen.vue";

export type HomeworkReviewResultNotice = {
  submissionId: string;
  contentItemId: string;
  lessonTitle: string;
  status: "needs_revision" | "accepted";
  reviewComment: string | null;
  reviewedAt: string;
};

defineProps<{ notices: HomeworkReviewResultNotice[]; dismissingIds: string[] }>();
defineEmits<{ back: []; dismiss: [submissionId: string]; openLesson: [contentItemId: string] }>();

function formatReviewDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value));
}
</script>

<template>
  <TaskScreen class="learning-task-screen homework-review-results-task" title="Результаты ДЗ" :subtitle="notices.length ? `${notices.length} новых результатов` : 'Все результаты просмотрены'" portal @back="$emit('back')">
    <section v-if="notices.length" class="homework-review-results" aria-label="Новые результаты домашних заданий">
      <article v-for="notice in notices" :key="notice.submissionId" class="homework-review-result" :class="`homework-review-result--${notice.status}`">
        <div class="homework-review-result__head">
          <span class="homework-review-result__status-icon">
            <CircleAlert v-if="notice.status === 'needs_revision'" aria-hidden="true" />
            <CheckCircle2 v-else aria-hidden="true" />
          </span>
          <div>
            <small>{{ notice.status === "needs_revision" ? "Домашнее задание не принято" : "ДЗ принято" }}</small>
            <strong>{{ notice.lessonTitle }}</strong>
            <time :datetime="notice.reviewedAt">{{ formatReviewDate(notice.reviewedAt) }}</time>
          </div>
          <button class="homework-review-result__dismiss ui-icon-button" type="button" :disabled="dismissingIds.includes(notice.submissionId)" :aria-label="`Закрыть результат ДЗ ${notice.lessonTitle}`" @click="$emit('dismiss', notice.submissionId)">
            <X aria-hidden="true" />
          </button>
        </div>

        <div v-if="notice.reviewComment" class="homework-review-result__comment">
          <small>Комментарий модератора</small>
          <p>{{ notice.reviewComment }}</p>
        </div>

        <button class="homework-review-result__open ui-button" type="button" :aria-label="`${notice.status === 'needs_revision' ? 'Исправить ДЗ' : 'Открыть урок'}: ${notice.lessonTitle}`" @click="$emit('openLesson', notice.contentItemId)">
          <span>{{ notice.status === "needs_revision" ? "Исправить ДЗ" : "Открыть урок" }}</span>
          <ArrowRight aria-hidden="true" />
        </button>
      </article>
    </section>

    <section v-else class="homework-review-results-empty ui-card">
      <CheckCircle2 aria-hidden="true" />
      <strong>Новых результатов нет</strong>
      <p>Все сообщения о проверке домашних заданий просмотрены.</p>
    </section>
  </TaskScreen>
</template>
