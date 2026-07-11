import type { AppNotification as ClubAppNotification } from "@club/shared";
import { defineStore } from "pinia";
import { ref } from "vue";
import { clearAppNotifications, deleteWebPushSubscription, getAppNotifications, getWebPushPublicKey, markAppNotificationsRead, saveWebPushSubscription } from "@/api/client";

export type AppNotificationKind = "error" | "success" | "info";

export type AppNotification = {
  id: number;
  kind: AppNotificationKind;
  message: string;
};

export type PushStatus = "idle" | "checking" | "unsupported" | "denied" | "disabled" | "enabling" | "enabled" | "disabling" | "error";

let nextNotificationId = 1;

export const useNotificationsStore = defineStore("notifications", () => {
  const items = ref<AppNotification[]>([]);
  const appNotifications = ref<ClubAppNotification[]>([]);
  const unreadCount = ref(0);
  const appNotificationsLoading = ref(false);
  const pushStatus = ref<PushStatus>("idle");

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

  async function clearAppNotificationsInApp() {
    const response = await clearAppNotifications();
    setUnreadCount(response.unreadCount);
    appNotifications.value = [];
  }

  function urlBase64ToUint8Array(value: string) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
      outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
  }

  function supportsBrowserPush() {
    return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  }

  async function refreshBrowserPushStatus() {
    if (!supportsBrowserPush()) {
      pushStatus.value = "unsupported";
      return pushStatus.value;
    }
    if (Notification.permission === "denied") {
      pushStatus.value = "denied";
      return pushStatus.value;
    }

    pushStatus.value = "checking";
    try {
      const registration = await navigator.serviceWorker.ready;
      pushStatus.value = (await registration.pushManager.getSubscription()) ? "enabled" : "disabled";
    } catch {
      pushStatus.value = "error";
    }
    return pushStatus.value;
  }

  async function enableBrowserPush() {
    if (!supportsBrowserPush()) {
      pushStatus.value = "unsupported";
      showError("Этот браузер не поддерживает PWA push-уведомления.");
      return;
    }

    pushStatus.value = "enabling";
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      pushStatus.value = "denied";
      showError("Разрешение на push-уведомления не выдано.");
      return;
    }

    try {
      const [{ publicKey }, registration] = await Promise.all([getWebPushPublicKey(), navigator.serviceWorker.ready]);
      if (!publicKey) {
        pushStatus.value = "error";
        showError("Push-ключи еще не настроены на сервере.");
        return;
      }

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      await saveWebPushSubscription(subscription.toJSON());
      await refreshBrowserPushStatus();
      showSuccess("Push-уведомления включены на этом устройстве.");
    } catch {
      pushStatus.value = "error";
      showError("Не удалось включить push-уведомления.");
    }
  }

  async function disableBrowserPush() {
    if (!supportsBrowserPush()) {
      pushStatus.value = "unsupported";
      showError("Этот браузер не поддерживает PWA push-уведомления.");
      return;
    }

    pushStatus.value = "disabling";
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deleteWebPushSubscription(subscription.toJSON());
        await subscription.unsubscribe();
      }
      await refreshBrowserPushStatus();
      showInfo("Push отключены. Оповещения больше не будут приходить на это устройство.");
    } catch {
      await refreshBrowserPushStatus();
      showError("Не удалось отключить push-уведомления на этом устройстве.");
    }
  }

  return {
    items,
    appNotifications,
    unreadCount,
    appNotificationsLoading,
    pushStatus,
    dismiss,
    showError,
    showSuccess,
    showInfo,
    clear,
    setUnreadCount,
    loadAppNotifications,
    markAppNotificationsReadInApp,
    clearAppNotificationsInApp,
    refreshBrowserPushStatus,
    enableBrowserPush,
    disableBrowserPush
  };
});
