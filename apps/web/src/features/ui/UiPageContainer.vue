<script setup lang="ts">
withDefaults(
  defineProps<{
    withBottomNav?: boolean;
    task?: boolean;
  }>(),
  {
    withBottomNav: false,
    task: false
  }
);
</script>

<template>
  <div
    class="ui-page-container"
    :class="{
      'ui-page-container--with-bottom-nav': withBottomNav,
      'ui-page-container--task': task
    }"
  >
    <slot />
  </div>
</template>
