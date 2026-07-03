<script setup lang="ts">
import type { AppNotification } from "@club/shared";
import { Bell, CheckCheck, Paperclip, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useNotificationsStore } from "@/stores/notifications";
import { escapeHtmlText, sanitizeHtml } from "@/utils/sanitizeHtml";

const isOpen = ref(false);
const notificationState = useNotificationsStore();

const badgeLabel = computed(() => (notificationState.unreadCount > 9 ? "9+" : String(notificationState.unreadCount)));

function renderNotificationHtml(notification: AppNotification) {
  const html = notification.bodyHtml?.trim();
  if (html) {
    return sanitizeHtml(html);
  }

  return escapeHtmlText(notification.body).replace(/\n/g, "<br>");
}

async function openCenter() {
  isOpen.value = true;
  await notificationState.loadAppNotifications();
  if (!notificationState.unreadCount) {
    return;
  }

  try {
    await notificationState.markAppNotificationsReadInApp();
  } catch {
    // Если отметка не прошла, счетчик обновится следующим polling.
  }
}

function closeCenter() {
  isOpen.value = false;
}

function formatNotificationDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

</script>

<template>
  <div class="notification-center">
    <button class="notification-center-button" type="button" aria-label="Уведомления" @click="openCenter">
      <Bell class="h-5 w-5" aria-hidden="true" />
      <span v-if="notificationState.unreadCount > 0" class="notification-center-badge">{{ badgeLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="notification-center-backdrop" @click.self="closeCenter">
        <aside class="notification-center-panel" role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
          <header class="notification-center-head">
            <div>
              <h3 id="notification-center-title">Уведомления</h3>
              <p>{{ notificationState.unreadCount ? `${notificationState.unreadCount} новых` : "Все прочитано" }}</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть уведомления" @click="closeCenter">
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div class="notification-center-list">
            <article
              v-for="notification in notificationState.appNotifications"
              :key="notification.id"
              class="notification-center-item"
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
                <a v-else-if="notification.attachment?.url" class="notification-center-attachment" :href="notification.attachment.url" target="_blank" rel="noreferrer">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span>{{ notification.attachment.fileName }}</span>
                </a>
              </div>
            </article>
            <p v-if="notificationState.appNotificationsLoading && !notificationState.appNotifications.length" class="notification-center-empty">Загружаем...</p>
            <p v-else-if="!notificationState.appNotifications.length" class="notification-center-empty">Пока нет уведомлений.</p>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
