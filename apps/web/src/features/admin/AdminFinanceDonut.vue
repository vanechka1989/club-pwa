<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  value: string;
  label: string;
  accessibleLabel: string;
  segments: Array<{ label: string; percent: number }>;
}>();

const visibleSegments = computed(() => {
  let offset = 0;
  return props.segments
    .map((segment, index) => ({ segment, colorIndex: index % 8 }))
    .filter(({ segment }) => segment.percent > 0)
    .map(({ segment, colorIndex }) => {
      const percent = Number(Math.max(0, Math.min(100, segment.percent)).toFixed(1));
      const result = { ...segment, percent, offset: Number(offset.toFixed(1)), colorIndex };
      offset += percent;
      return result;
    });
});
</script>

<template>
  <figure class="admin-finance-donut" role="img" :aria-label="accessibleLabel">
    <div class="admin-finance-donut-visual" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle class="admin-finance-donut-track" cx="50" cy="50" r="42" pathLength="100" />
        <circle
          v-for="segment in visibleSegments"
          :key="segment.label"
          class="admin-finance-donut-segment"
          :class="`is-segment-${segment.colorIndex}`"
          cx="50"
          cy="50"
          r="42"
          pathLength="100"
          :stroke-dasharray="`${segment.percent} ${Number((100 - segment.percent).toFixed(1))}`"
          :stroke-dashoffset="`-${segment.offset}`"
        />
      </svg>
      <div><strong>{{ value }}</strong><small>{{ label }}</small></div>
    </div>
  </figure>
</template>
