<script setup lang="ts">
import { ArrowRight, CheckCircle2, CircleAlert, Play } from "lucide-vue-next";

withDefaults(defineProps<{
  percent: number;
  completed: number;
  total: number;
  state: string;
  title: string;
  context: string;
  imageUrl: string;
  actionLabel: string;
  reviewStatus?: "needs_revision" | "accepted" | null | undefined;
  reviewLessonTitle?: string | null | undefined;
  reviewComment?: string | null | undefined;
}>(), {
  reviewStatus: null,
  reviewLessonTitle: null,
  reviewComment: null
});

defineEmits<{ open: []; openReview: [] }>();
</script>

<template>
  <section class="learning-progress-hero ui-card" aria-label="Продолжение обучения">
    <header class="learning-progress-hero__summary">
      <div
        class="learning-progress-ring"
        role="progressbar"
        aria-label="Общий прогресс обучения"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="percent"
        :aria-valuetext="`Пройдено ${completed} из ${total} уроков`"
        :style="{ '--learning-progress': `${percent * 3.6}deg` }"
      >
        <span><strong>{{ percent }}%</strong><small>готово</small></span>
      </div>
      <div class="learning-progress-hero__copy">
        <span>{{ state }}</span>
        <strong>{{ completed }} из {{ total }} уроков</strong>
        <small>{{ percent === 100 ? 'Можно повторить материал в любое время' : 'Следующий шаг уже подготовлен' }}</small>
      </div>
      <CheckCircle2 v-if="percent === 100" class="learning-progress-hero__state-icon" aria-hidden="true" />
    </header>

    <button
      v-if="reviewStatus && reviewLessonTitle"
      class="learning-progress-hero__review ui-button"
      :class="`learning-progress-hero__review--${reviewStatus}`"
      type="button"
      :aria-label="`${reviewStatus === 'needs_revision' ? 'Исправить ДЗ' : 'Открыть урок'}: ${reviewLessonTitle}`"
      @click="$emit('openReview')"
    >
      <span class="learning-progress-hero__review-icon">
        <CircleAlert v-if="reviewStatus === 'needs_revision'" aria-hidden="true" />
        <CheckCircle2 v-else aria-hidden="true" />
      </span>
      <span class="learning-progress-hero__review-copy">
        <small>{{ reviewStatus === "needs_revision" ? "Нужна доработка" : "ДЗ принято" }}</small>
        <strong>{{ reviewLessonTitle }}</strong>
        <p v-if="reviewComment">{{ reviewComment }}</p>
        <em>{{ reviewStatus === "needs_revision" ? "Исправить ДЗ" : "Открыть урок" }}</em>
      </span>
      <ArrowRight aria-hidden="true" />
    </button>

    <button class="learning-progress-hero__lesson ui-button" type="button" :aria-label="`${actionLabel}: ${title}`" @click="$emit('open')">
      <img :src="imageUrl" :alt="title" loading="lazy" />
      <span>
        <small>{{ context }}</small>
        <strong>{{ title }}</strong>
        <em><Play aria-hidden="true" />{{ actionLabel }}</em>
      </span>
      <ArrowRight aria-hidden="true" />
    </button>
  </section>
</template>
