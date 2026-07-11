<script setup lang="ts">
defineProps<{
  label?: string;
  forId?: string;
  help?: string;
  error?: string;
}>();
</script>

<template>
  <label v-if="label && forId" class="ui-form-field" :for="forId">
    <span class="ui-form-field__label">{{ label }}</span>
    <slot />
    <span v-if="help" class="ui-form-field__help">{{ help }}</span>
    <span v-if="error" class="ui-form-field__error">{{ error }}</span>
  </label>
  <div v-else class="ui-form-field">
    <span v-if="label" class="ui-form-field__label">{{ label }}</span>
    <slot />
    <p v-if="help" class="ui-form-field__help">{{ help }}</p>
    <p v-if="error" class="ui-form-field__error">{{ error }}</p>
  </div>
</template>
