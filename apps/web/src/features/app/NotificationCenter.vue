<script setup lang="ts">
import type { AppNotification } from "@club/shared";
import { Bell, CheckCheck, Paperclip, X } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getAppNotifications, markAppNotificationsRead } from "@/api/client";

const notifications = ref<AppNotification[]>([]);
const unreadCount = ref(0);
const isOpen = ref(false);
const loading = ref(false);
let notificationTimer: number | null = null;

const badgeLabel = computed(() => (unreadCount.value > 9 ? "9+" : String(unreadCount.value)));

async function loadNotifications() {
  loading.value = true;
  try {
    const response = await getAppNotifications();
    notifications.value = response.notifications;
    unreadCount.value = response.unreadCount;
  } catch {
    // Следующая проверка повторится по таймеру.
  } finally {
    loading.value = false;
  }
}

async function openCenter() {
  isOpen.value = true;
  await loadNotifications();
  if (!unreadCount.value) {
    return;
  }

  try {
    const response = await markAppNotificationsRead();
    unreadCount.value = response.unreadCount;
    notifications.value = notifications.value.map((notification) => ({
      ...notification,
      readAt: notification.readAt ?? new Date().toISOString()
    }));
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

onMounted(() => {
  void loadNotifications();
  notificationTimer = window.setInterval(() => {
    void loadNotifications();
  }, 10_000);
});

onBeforeUnmount(() => {
  if (notificationTimer) {
    window.clearInterval(notificationTimer);
    notificationTimer = null;
  }
});
</script>

<template>
  <div class="notification-center">
    <button class="notification-center-button" type="button" aria-label="Уведомления" @click="openCenter">
      <Bell class="h-5 w-5" aria-hidden="true" />
      <span v-if="unreadCount > 0" class="notification-center-badge">{{ badgeLabel }}</span>
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="notification-center-backdrop" @click.self="closeCenter">
        <aside class="notification-center-panel" role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
          <header class="notification-center-head">
            <div>
              <h3 id="notification-center-title">Уведомления</h3>
              <p>{{ unreadCount ? `${unreadCount} новых` : "Все прочитано" }}</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть уведомления" @click="closeCenter">
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div class="notification-center-list">
            <article
              v-for="notification in notifications"
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
                <p>{{ notification.body }}</p>
                <a v-if="notification.attachment?.url" class="notification-center-attachment" :href="notification.attachment.url" target="_blank" rel="noreferrer">
                  <Paperclip class="h-4 w-4" aria-hidden="true" />
                  <span>{{ notification.attachment.fileName }}</span>
                </a>
              </div>
            </article>
            <p v-if="loading && !notifications.length" class="notification-center-empty">Загружаем...</p>
            <p v-else-if="!notifications.length" class="notification-center-empty">Пока нет уведомлений.</p>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>
