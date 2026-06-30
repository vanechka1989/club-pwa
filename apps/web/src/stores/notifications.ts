import { defineStore } from "pinia";
import { ref } from "vue";

export type AppNotificationKind = "error" | "success" | "info";

export type AppNotification = {
  id: number;
  kind: AppNotificationKind;
  message: string;
};

let nextNotificationId = 1;

export const useNotificationsStore = defineStore("notifications", () => {
  const items = ref<AppNotification[]>([]);
  const unreadCount = ref(0);

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

  return {
    items,
    unreadCount,
    dismiss,
    showError,
    showSuccess,
    showInfo,
    clear,
    setUnreadCount
  };
});
