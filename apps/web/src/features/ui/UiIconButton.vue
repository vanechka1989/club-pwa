<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label: string;
    variant?: "neutral" | "primary" | "danger" | "ghost";
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
  }>(),
  {
    variant: "neutral",
    type: "button",
    disabled: false
  }
);

const classes = computed(() => ["ui-icon-button", `ui-icon-button--${props.variant}`]);
</script>

<template>
  <button :class="classes" :type="type" :aria-label="label" :disabled="disabled">
    <slot />
  </button>
</template>
