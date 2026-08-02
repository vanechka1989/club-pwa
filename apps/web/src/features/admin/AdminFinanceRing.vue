<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  percent: number;
  value: string;
  label: string;
  caption?: string;
  tone?: "accent" | "success" | "warning" | "danger" | "info";
  size?: "regular" | "compact" | "hero";
}>(), {
  caption: "",
  tone: "accent",
  size: "regular"
});

const normalizedPercent = computed(() => Math.max(0, Math.min(100, props.percent)));
const dashOffset = computed(() => Number((100 - normalizedPercent.value).toFixed(1)).toString());
const accessibleLabel = computed(() => `${props.label}: ${props.value}${props.caption ? `. ${props.caption}` : ""}`);
</script>

<template>
  <figure
    class="admin-finance-ring"
    :class="[`is-${tone}`, `is-${size}`]"
    role="img"
    :aria-label="accessibleLabel"
  >
    <div class="admin-finance-ring-visual" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle class="admin-finance-ring-track" cx="50" cy="50" r="43" pathLength="100" />
        <circle
          class="admin-finance-ring-progress"
          cx="50"
          cy="50"
          r="43"
          pathLength="100"
          stroke-dasharray="100"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
      <strong>{{ value }}</strong>
    </div>
    <figcaption>
      <b>{{ label }}</b>
      <small v-if="caption">{{ caption }}</small>
    </figcaption>
  </figure>
</template>
