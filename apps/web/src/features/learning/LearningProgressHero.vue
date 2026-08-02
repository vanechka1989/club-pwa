<script setup lang="ts">
import { ArrowRight, CheckCircle2, ClipboardCheck, Play } from "lucide-vue-next";

defineProps<{
  percent: number;
  completed: number;
  total: number;
  state: string;
  title: string;
  context: string;
  imageUrl: string;
  actionLabel: string;
  reviewCount: number;
}>();

defineEmits<{ open: []; openReviews: [] }>();
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

    <button v-if="reviewCount > 0" class="learning-progress-hero__reviews ui-button" type="button" :aria-label="`Открыть результаты проверок ДЗ: ${reviewCount}`" @click="$emit('openReviews')">
      <span class="learning-progress-hero__reviews-icon"><ClipboardCheck aria-hidden="true" /></span>
      <span><strong>Проверки ДЗ</strong><small>Результаты и комментарии модератора</small></span>
      <em>{{ reviewCount > 9 ? "9+" : reviewCount }}</em>
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
