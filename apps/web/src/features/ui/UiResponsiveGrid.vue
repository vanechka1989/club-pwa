<script setup lang="ts">
withDefaults(
  defineProps<{
    single?: boolean;
  }>(),
  {
    single: false
  }
);
</script>

<template>
  <div class="ui-responsive-grid" :class="{ 'ui-button-group--stack': single }">
    <slot />
  </div>
</template>
