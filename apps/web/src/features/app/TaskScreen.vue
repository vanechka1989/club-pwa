<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

defineOptions({ inheritAttrs: false });

defineProps<{
  title: string;
  subtitle?: string;
  backLabel?: string;
  portal?: boolean;
}>();

defineEmits<{ back: [] }>();
</script>

<template>
  <Teleport to="body" :disabled="!portal">
  <div :class="[$attrs.class, { 'task-screen-route-layer': portal }]">
  <section class="task-screen">
    <header class="task-screen-header">
      <button class="task-screen-back" type="button" :aria-label="backLabel || 'Назад'" @click="$emit('back')">
        <ArrowLeft class="h-5 w-5" aria-hidden="true" />
      </button>
      <div class="task-screen-heading">
        <h2>{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="task-screen-actions">
        <slot name="actions" />
      </div>
    </header>

    <div class="task-screen-body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="task-screen-footer">
      <slot name="footer" />
    </footer>
  </section>
  </div>
  </Teleport>
</template>
