<script setup lang="ts">
import { LoaderCircle } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { useOperationsStore } from "@/stores/operations";

const operations = useOperationsStore();
const { activeOperation } = storeToRefs(operations);
</script>

<template>
  <Teleport to="body">
    <aside
      v-if="activeOperation"
      class="app-operation-indicator"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div class="app-operation-main">
        <LoaderCircle class="app-operation-spinner" aria-hidden="true" />
        <strong>{{ activeOperation.title }}</strong>
      </div>
      <p v-if="activeOperation.detail">{{ activeOperation.detail }}</p>
      <div class="app-operation-progress" aria-hidden="true">
        <i></i>
      </div>
    </aside>
  </Teleport>
</template>
