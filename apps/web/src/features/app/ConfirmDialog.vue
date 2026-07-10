<script setup lang="ts">
defineProps<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
}>();

defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-dialog-backdrop" @click.self="$emit('cancel')">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-label="title">
        <h3>{{ title }}</h3>
        <p>{{ description }}</p>
        <div class="confirm-dialog-actions">
          <button class="secondary-button" type="button" :disabled="busy" @click="$emit('cancel')">
            {{ cancelLabel || "Отмена" }}
          </button>
          <button class="primary-button" :class="{ 'danger-button': danger }" type="button" :disabled="busy" @click="$emit('confirm')">
            {{ confirmLabel }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
