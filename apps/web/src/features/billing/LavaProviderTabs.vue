<script setup lang="ts">
const props = defineProps<{
  modelValue: "connection" | "catalog";
  catalogEnabled: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: "connection" | "catalog"];
}>();

function openCatalog() {
  if (props.catalogEnabled) {
    emit("update:modelValue", "catalog");
  }
}
</script>

<template>
  <div class="lava-tabs" role="tablist" aria-label="Этап настройки Lava">
    <button
      class="lava-tabs__button"
      type="button"
      role="tab"
      :aria-selected="modelValue === 'connection'"
      :class="{ 'lava-tabs__button--active': modelValue === 'connection' }"
      @click="emit('update:modelValue', 'connection')"
    >
      Подключение
    </button>
    <button
      class="lava-tabs__button"
      type="button"
      role="tab"
      :aria-selected="modelValue === 'catalog'"
      :class="{ 'lava-tabs__button--active': modelValue === 'catalog' }"
      :disabled="!catalogEnabled"
      @click="openCatalog"
    >
      Проверка и товары
    </button>
  </div>
</template>

<style scoped>
.lava-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:0;padding:4px;border:1px solid var(--line);border-radius:18px;background:var(--field)}
.lava-tabs__button{min-width:0;min-height:44px;padding:8px 10px;border:1px solid transparent;border-radius:14px;background:transparent;color:var(--muted);font:inherit;font-size:.86rem;font-weight:800;line-height:1.2}
.lava-tabs__button--active{border-color:color-mix(in srgb,var(--accent) 65%,var(--line));background:color-mix(in srgb,var(--accent) 14%,var(--surface));color:var(--text)}
.lava-tabs__button:disabled{opacity:.4}
@media(max-width:340px){.lava-tabs__button{padding-inline:6px;font-size:.78rem}}
</style>
