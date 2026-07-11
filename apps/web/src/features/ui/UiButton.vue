<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "danger" | "ghost";
    size?: "normal" | "large" | "compact";
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "primary",
    size: "normal",
    type: "button",
    loading: false,
    disabled: false
  }
);

const classes = computed(() => [
  "ui-button",
  `ui-button--${props.variant}`,
  props.size !== "normal" ? `ui-button--${props.size}` : ""
]);
</script>

<template>
  <button :class="classes" :type="type" :disabled="disabled || loading" :aria-busy="loading || undefined">
    <slot name="icon" />
    <slot />
  </button>
</template>
