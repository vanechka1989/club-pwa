<script setup lang="ts">
import { BellPlus, X } from "lucide-vue-next";
import { onMounted, ref, watch } from "vue";
import { isInstalledPwaDisplay } from "@/features/app/pwaDisplay";
import { useNotificationsStore } from "@/stores/notifications";

const promptStorageKey = "club-push-onboarding-dismissed-v1";
const isVisible = ref(false);
const isEnabling = ref(false);
const notifications = useNotificationsStore();

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    isInstalledPwaDisplay()
  );
}

function wasDismissed() {
  try {
    return localStorage.getItem(promptStorageKey) === "1";
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(promptStorageKey, "1");
  } catch {
    // Storage может быть недоступен, но prompt просто не будет запомнен.
  }
}

function evaluateVisibility() {
  if (!isPushSupported() || wasDismissed() || Notification.permission !== "default") {
    isVisible.value = false;
    return;
  }

  isVisible.value = true;
}

async function enablePush() {
  if (isEnabling.value) {
    return;
  }

  isEnabling.value = true;
  await notifications.enableBrowserPush();
  isEnabling.value = false;

  if (notifications.pushStatus === "enabled" || Notification.permission !== "default") {
    markDismissed();
    isVisible.value = false;
  }
}

function dismissPrompt() {
  markDismissed();
  isVisible.value = false;
}

onMounted(() => {
  window.setTimeout(evaluateVisibility, 700);
});

watch(
  () => notifications.pushStatus,
  (status) => {
    if (status === "enabled") {
      markDismissed();
      isVisible.value = false;
    }
  }
);
</script>

<template>
  <aside v-if="isVisible" class="push-permission-card" role="dialog" aria-live="polite" aria-labelledby="push-permission-title">
    <button class="push-permission-close" type="button" aria-label="Закрыть предложение уведомлений" @click="dismissPrompt">
      <X class="h-4 w-4" aria-hidden="true" />
    </button>

    <span class="push-permission-icon" aria-hidden="true">
      <BellPlus class="h-5 w-5" />
    </span>

    <div class="push-permission-copy">
      <strong id="push-permission-title">Включите уведомления</strong>
      <p>Коды, ответы поддержки, оплаты и новости клуба будут приходить сразу в приложение.</p>
    </div>

    <div class="push-permission-actions">
      <button class="push-permission-enable" type="button" :disabled="isEnabling" @click="enablePush">
        {{ isEnabling ? "Открываем..." : "Включить" }}
      </button>
      <button class="push-permission-later" type="button" :disabled="isEnabling" @click="dismissPrompt">Позже</button>
    </div>
  </aside>
</template>
