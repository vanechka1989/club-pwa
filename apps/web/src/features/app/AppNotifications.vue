<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info, X } from "lucide-vue-next";
import { useNotificationsStore } from "@/stores/notifications";

const notifications = useNotificationsStore();

const iconByKind = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info
} as const;
</script>

<template>
  <Teleport to="body">
    <div
      v-if="notifications.items.length"
      class="app-toast-viewport"
      aria-live="polite"
      aria-atomic="false"
    >
      <article
        v-for="item in notifications.items"
        :key="item.id"
        class="app-toast"
        :class="`app-toast-${item.kind}`"
        :role="item.kind === 'error' ? 'alert' : 'status'"
      >
        <component :is="iconByKind[item.kind]" class="app-toast-icon" aria-hidden="true" />
        <span class="app-toast-message">{{ item.message }}</span>
        <button
          class="app-toast-close"
          type="button"
          aria-label="Закрыть уведомление"
          @click="notifications.dismiss(item.id)"
        >
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </article>
    </div>
  </Teleport>
</template>
