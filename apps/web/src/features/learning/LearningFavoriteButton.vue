<script setup lang="ts">
import { Bookmark, BookmarkCheck } from "lucide-vue-next";

withDefaults(defineProps<{ active: boolean; pending: boolean; compact?: boolean }>(), { compact: false });
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    class="learning-favorite-button ui-button"
    :class="{ 'is-active': active, 'is-compact': compact }"
    type="button"
    :disabled="pending"
    :aria-pressed="active"
    :aria-label="active ? 'Убрать из избранного' : 'Добавить в избранное'"
    @click.stop="$emit('toggle')"
  >
    <BookmarkCheck v-if="active" aria-hidden="true" />
    <Bookmark v-else aria-hidden="true" />
    <span v-if="!compact">{{ active ? "В избранном" : "В избранное" }}</span>
  </button>
</template>
