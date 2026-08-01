<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ title: string; completed: number; total: number; percent: number }>();
const state = computed(() => props.percent >= 100 ? "Завершён" : props.percent > 0 ? "В процессе" : "Не начат");
</script>

<template>
  <div class="learning-module-progress" :class="`learning-module-progress--${percent >= 100 ? 'done' : percent > 0 ? 'active' : 'idle'}`">
    <div class="learning-module-progress__meta">
      <span class="learning-module-progress__state">{{ state }}</span>
      <span>{{ completed }} из {{ total }} уроков</span>
      <strong>{{ percent }}%</strong>
    </div>
    <div
      class="learning-module-progress__track"
      role="progressbar"
      :aria-label="`Прогресс модуля ${title}`"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="percent"
      :aria-valuetext="`Пройдено ${completed} из ${total} уроков`"
    ><span :style="{ width: `${percent}%` }"></span></div>
  </div>
</template>
