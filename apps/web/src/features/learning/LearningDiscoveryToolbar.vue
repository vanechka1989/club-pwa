<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import { Search, X } from "lucide-vue-next";
import type { LearningDiscoveryFilter } from "./learningDiscovery";

defineProps<{ query: string; filter: LearningDiscoveryFilter }>();
const emit = defineEmits<{
  "update:query": [value: string];
  "update:filter": [value: LearningDiscoveryFilter];
  reset: [];
  close: [];
}>();
const searchInput = ref<HTMLInputElement | null>(null);

const filters: Array<{ value: LearningDiscoveryFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "favorites", label: "Избранное" },
  { value: "in_progress", label: "В процессе" },
  { value: "completed", label: "Пройдено" }
];

onMounted(async () => {
  await nextTick();
  searchInput.value?.focus();
});
</script>

<template>
  <section class="learning-discovery-toolbar ui-card" aria-label="Поиск и фильтры уроков" @keydown.esc="emit('close')">
    <header class="learning-discovery-head">
      <div><strong>Найти урок</strong><span>По названию, модулю или статусу</span></div>
      <button type="button" aria-label="Закрыть поиск" @click="emit('close')"><X aria-hidden="true" /></button>
    </header>
    <label class="learning-search-field">
      <Search aria-hidden="true" />
      <input
        ref="searchInput"
        :value="query"
        type="search"
        aria-label="Найти модуль или урок"
        placeholder="Найти модуль или урок"
        @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      />
      <button v-if="query" type="button" aria-label="Очистить поиск" @click="emit('reset')">
        <X aria-hidden="true" />
      </button>
    </label>
    <div class="learning-filter-list" role="group" aria-label="Фильтр уроков">
      <button
        v-for="item in filters"
        :key="item.value"
        type="button"
        :class="{ 'is-active': filter === item.value }"
        :aria-pressed="filter === item.value"
        @click="emit('update:filter', item.value)"
      >
        {{ item.label }}
      </button>
    </div>
  </section>
</template>
