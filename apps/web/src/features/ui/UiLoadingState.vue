<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
  }>(),
  {
    title: "Загрузка"
  }
);
</script>

<template>
  <section class="ui-loading-state" aria-live="polite">
    <strong>{{ title }}</strong>
    <slot />
  </section>
</template>
