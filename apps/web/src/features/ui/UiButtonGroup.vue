<script setup lang="ts">
withDefaults(
  defineProps<{
    stack?: boolean;
  }>(),
  {
    stack: false
  }
);
</script>

<template>
  <div class="ui-button-group" :class="{ 'ui-button-group--stack': stack }">
    <slot />
  </div>
</template>
