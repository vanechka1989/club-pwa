<script setup lang="ts">
import type { AppNotification } from "@club/shared";
import { Bell, BellPlus, CheckCheck, Paperclip, Trash2 } from "lucide-vue-next";
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { useI18n } from "@/features/app/i18n";
import { useNotificationsStore } from "@/stores/notifications";
import { escapeHtmlText, sanitizeHtml } from "@/utils/sanitizeHtml";

const router = useRouter();
const notificationState = useNotificationsStore();
const { currentLocale, t } = useI18n();
const subtitle = computed(() =>
  notificationState.unreadCount ? `${notificationState.unreadCount} ${t("notificationsNew")}` : t("notificationsRead")
);

function renderNotificationHtml(notification: AppNotification) {
  const html = notification.bodyHtml?.trim();
  return html ? sanitizeHtml(html) : escapeHtmlText(notification.body).replace(/\n/g, "<br>");
}

async function loadNotifications() {
  await notificationState.loadAppNotifications();
  if (notificationState.unreadCount) {
    await notificationState.markAppNotificationsReadInApp().catch(() => undefined);
  }
}

async function clearNotifications() {
  if (!notificationState.appNotifications.length || notificationState.appNotificationsLoading) return;
  await notificationState.clearAppNotificationsInApp();
}

async function enableBrowserPush() {
  if (notificationState.pushStatus !== "enabled") await notificationState.enableBrowserPush();
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString(currentLocale.value === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

onMounted(() => void loadNotifications());
</script>

<template>
  <TaskScreen class="notification-task-screen" :title="t('notificationsTitle')" :subtitle="subtitle" portal @back="router.push('/profile')">
    <template #actions>
      <button
        class="notification-center-clear ui-button"
        type="button"
        :disabled="notificationState.pushStatus === 'enabled'"
        @click="enableBrowserPush"
      >
        <BellPlus class="h-4 w-4" aria-hidden="true" />
        <span>{{ notificationState.pushStatus === "enabled" ? "Push включены" : "Включить push" }}</span>
      </button>
      <button
        class="icon-button ui-icon-button"
        type="button"
        :aria-label="t('notificationsClear')"
        :disabled="notificationState.appNotificationsLoading || !notificationState.appNotifications.length"
        @click="clearNotifications"
      >
        <Trash2 class="h-4 w-4" aria-hidden="true" />
      </button>
    </template>

    <div class="notification-center-list">
      <article
        v-for="notification in notificationState.appNotifications"
        :key="notification.id"
        class="notification-center-item ui-card"
        :class="{ 'notification-center-item-unread': !notification.readAt }"
      >
        <span class="notification-center-dot">
          <CheckCheck v-if="notification.readAt" class="h-4 w-4" aria-hidden="true" />
          <Bell v-else class="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <header>
            <strong>{{ notification.title }}</strong>
            <time>{{ formatNotificationDate(notification.createdAt) }}</time>
          </header>
          <div class="notification-center-copy" v-html="renderNotificationHtml(notification)"></div>
          <a
            v-if='notification.attachment?.url && notification.attachment.kind === "photo"'
            class="notification-center-media"
            :href="notification.attachment.url"
            target="_blank"
            rel="noreferrer"
          >
            <img :src="notification.attachment.url" :alt="notification.attachment.fileName" loading="lazy" />
          </a>
          <div v-else-if='notification.attachment?.url && notification.attachment.kind === "video"' class="notification-center-media">
            <video :src="notification.attachment.url" controls playsinline preload="metadata"></video>
          </div>
          <a
            v-else-if="notification.attachment?.url"
            class="notification-center-attachment"
            :href="notification.attachment.url"
            target="_blank"
            rel="noreferrer"
          >
            <Paperclip class="h-4 w-4" aria-hidden="true" />
            <span>{{ notification.attachment.fileName }}</span>
          </a>
        </div>
      </article>
      <p v-if="notificationState.appNotificationsLoading && !notificationState.appNotifications.length" class="notification-center-empty">
        {{ t("notificationsLoading") }}
      </p>
      <p v-else-if="!notificationState.appNotifications.length" class="notification-center-empty">{{ t("notificationsEmpty") }}</p>
    </div>
  </TaskScreen>
</template>
