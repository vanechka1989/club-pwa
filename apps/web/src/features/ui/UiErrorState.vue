<script setup lang="ts">
defineProps<{
  title?: string;
  text?: string;
}>();
</script>

<template>
  <section class="ui-error-state" role="alert">
    <strong v-if="title">{{ title }}</strong>
    <p v-if="text">{{ text }}</p>
    <slot />
  </section>
</template>
