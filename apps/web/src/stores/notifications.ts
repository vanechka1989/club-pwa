import type { AppNotification as ClubAppNotification } from "@club/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { getAppNotifications, markAppNotificationsRead } from "@/api/client";

export type AppNotificationKind = "error" | "success" | "info";

export type AppNotification = {
  id: number;
  kind: AppNotificationKind;
  message: string;
};

let nextNotificationId = 1;

export const useNotificationsStore = defineStore("notifications", () => {
  const items = ref<AppNotification[]>([]);
  const appNotifications = ref<ClubAppNotification[]>([]);
  const unreadCount = ref(0);
  const appNotificationsLoading = ref(false);

  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id);
  }

  function push(kind: AppNotificationKind, message: string, timeoutMs = 4500) {
    const text = message.trim();
    if (!text) {
      return null;
    }

    const id = nextNotificationId++;
    items.value = [...items.value, { id, kind, message: text }];

    if (typeof window !== "undefined" && timeoutMs > 0) {
      window.setTimeout(() => dismiss(id), timeoutMs);
    }

    return id;
  }

  function showError(message: string, timeoutMs?: number) {
    return push("error", message, timeoutMs);
  }

  function showSuccess(message: string, timeoutMs?: number) {
    return push("success", message, timeoutMs);
  }

  function showInfo(message: string, timeoutMs?: number) {
    return push("info", message, timeoutMs);
  }

  function clear() {
    items.value = [];
  }

  function setUnreadCount(nextUnreadCount: number) {
    unreadCount.value = Math.max(0, nextUnreadCount);
  }

  async function loadAppNotifications() {
    appNotificationsLoading.value = true;
    try {
      const response = await getAppNotifications();
      appNotifications.value = response.notifications;
      setUnreadCount(response.unreadCount);
    } catch {
      // Следующая проверка повторится по таймеру приложения.
    } finally {
      appNotificationsLoading.value = false;
    }
  }

  async function markAppNotificationsReadInApp() {
    const response = await markAppNotificationsRead();
    setUnreadCount(response.unreadCount);
    appNotifications.value = appNotifications.value.map((notification) => ({
      ...notification,
      readAt: notification.readAt ?? new Date().toISOString()
    }));
  }

  return {
    items,
    appNotifications,
    unreadCount,
    appNotificationsLoading,
    dismiss,
    showError,
    showSuccess,
    showInfo,
    clear,
    setUnreadCount,
    loadAppNotifications,
    markAppNotificationsReadInApp
  };
});
