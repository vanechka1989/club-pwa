<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string | undefined;
    back?: boolean;
    backLabel?: string | undefined;
  }>(),
  {
    subtitle: "",
    back: false,
    backLabel: "Назад"
  }
);

defineEmits<{ back: [] }>();
</script>

<template>
  <header class="section-head ui-page-header">
    <button v-if="back" class="ui-page-header__back" type="button" :aria-label="backLabel" @click="$emit('back')">
      <slot name="back-icon">
        <ArrowLeft aria-hidden="true" />
      </slot>
    </button>

    <div class="ui-page-header__text">
      <h2 class="ui-page-header__title">{{ title }}</h2>
      <p v-if="subtitle" class="ui-page-header__subtitle">{{ subtitle }}</p>
    </div>

    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
