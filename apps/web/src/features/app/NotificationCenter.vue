<script setup lang="ts">
import { Bell } from "lucide-vue-next";
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "@/features/app/i18n";
import { useNotificationsStore } from "@/stores/notifications";

const router = useRouter();
const notificationState = useNotificationsStore();
const { t } = useI18n();
const badgeLabel = computed(() => (notificationState.unreadCount > 9 ? "9+" : String(notificationState.unreadCount)));

function openCenter() {
  void router.push("/notifications");
}
</script>

<template>
  <div class="notification-center">
    <button class="notification-center-button" type="button" :aria-label="t('notificationsTitle')" @click="openCenter">
      <Bell class="h-5 w-5" aria-hidden="true" />
      <span v-if="notificationState.unreadCount > 0" class="notification-center-badge">{{ badgeLabel }}</span>
    </button>
  </div>
</template>
