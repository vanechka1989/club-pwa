<script setup lang="ts">
defineProps<{ title: string; open: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bottom-sheet-backdrop" @click.self="$emit('close')">
      <section class="bottom-sheet" role="dialog" aria-modal="true" :aria-label="title">
        <span class="bottom-sheet-handle" aria-hidden="true"></span>
        <header class="bottom-sheet-header">
          <h3>{{ title }}</h3>
          <button type="button" aria-label="Закрыть" @click="$emit('close')">×</button>
        </header>
        <div class="bottom-sheet-body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>
