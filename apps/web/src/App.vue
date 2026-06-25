<script setup lang="ts">
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getPaymentHistory } from "@/api/client";
import AdminSection from "@/features/admin/AdminSection.vue";
import PaymentsSection from "@/features/billing/PaymentsSection.vue";
import { shouldShowAccessClosedAlert } from "@/features/app/accessStatus";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch } from "@/features/billing/paymentWatch";
import CommunitySection from "@/features/community/CommunitySection.vue";
import { useI18n } from "@/features/app/i18n";
import LearningSection from "@/features/learning/LearningSection.vue";
import { navItems, type AppSection } from "@/features/app/navigation";
import ProfileSection from "@/features/profile/ProfileSection.vue";
import SupportSection from "@/features/support/SupportSection.vue";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

const session = useSessionStore();
const ui = useUiStore();
const { t } = useI18n();
const activeSection = ref<AppSection>("profile");
const navCollapsed = ref(false);
const communityChatOpen = ref(false);
let paymentWatchTimer: number | null = null;
let sessionRefreshTimer: number | null = null;

function showTelegramAlert(message: string) {
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
    return;
  }

  window.alert(message);
}

const visibleNavItems = computed(() =>
  navItems.filter((item) => !item.adminOnly || session.user?.realRole === "admin" || session.user?.realRole === "owner")
);

function syncCommunityLock(isLocked: boolean) {
  document.documentElement.classList.toggle("club-community-locked", isLocked);
  document.body.classList.toggle("club-community-locked", isLocked);

  if (isLocked) {
    window.scrollTo({ top: 0, left: 0 });
  }
}

function resetWindowScroll() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

async function selectSection(section: AppSection) {
  if (activeSection.value === section) {
    resetWindowScroll();
    return;
  }

  resetWindowScroll();
  activeSection.value = section;
  await nextTick();
  resetWindowScroll();
}

function syncTelegramSafeArea() {
  const webApp = window.Telegram?.WebApp;
  const topInset = Math.max(webApp?.contentSafeAreaInset?.top ?? 0, webApp?.safeAreaInset?.top ?? 0);
  const bottomInset = Math.max(webApp?.contentSafeAreaInset?.bottom ?? 0, webApp?.safeAreaInset?.bottom ?? 0);

  document.documentElement.style.setProperty("--tg-safe-top", `${topInset}px`);
  document.documentElement.style.setProperty("--tg-safe-bottom", `${bottomInset}px`);
}

function syncViewportHeight() {
  const webApp = window.Telegram?.WebApp;
  const telegramHeight = webApp?.viewportHeight || webApp?.viewportStableHeight || 0;
  const visualHeight = window.visualViewport?.height ?? 0;
  const browserHeight = window.innerHeight || 0;
  const height = Math.max(telegramHeight, visualHeight, browserHeight);

  if (height > 0) {
    document.documentElement.style.setProperty("--club-viewport-height", `${height}px`);
  }
}

function syncTelegramFullscreen(isEnabled: boolean) {
  const webApp = window.Telegram?.WebApp;
  webApp?.expand();
  syncTelegramSafeArea();
  syncViewportHeight();
  document.documentElement.classList.toggle("club-telegram-fullscreen", isEnabled);
  document.body.classList.toggle("club-telegram-fullscreen", isEnabled);

  if (isEnabled) {
    try {
      webApp?.requestFullscreen?.();
    } catch {
      ui.setFullscreenEnabled(false);
      document.documentElement.classList.remove("club-telegram-fullscreen");
      document.body.classList.remove("club-telegram-fullscreen");
    }
    window.setTimeout(() => {
      syncTelegramSafeArea();
      syncViewportHeight();
    }, 250);
    return;
  }

  try {
    webApp?.exitFullscreen?.();
  } catch {
    // Telegram clients without fullscreen support can ignore this path.
  }
  window.setTimeout(() => {
    syncTelegramSafeArea();
    syncViewportHeight();
  }, 250);
}

async function checkPendingPaymentWatch() {
  const watch = readPaymentWatch();
  if (!watch) {
    return;
  }

  const startedAt = Date.parse(watch.startedAt);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt > 20 * 60 * 1000) {
    clearPaymentWatch();
    return;
  }

  try {
    const response = await getPaymentHistory();
    const watchedOrders = response.orders.filter((order) => isOrderWithinPaymentWatch(order, watch));
    const paidOrder = watchedOrders.find((order) => order.status === "paid");
    if (paidOrder) {
      clearPaymentWatch();
      await session.load();
      showTelegramAlert("Оплата прошла. Доступ обновлен.");
      return;
    }

    const failedOrder = watchedOrders.find((order) => order.status === "failed" || order.status === "cancelled");
    if (failedOrder) {
      clearPaymentWatch();
      showTelegramAlert("Оплата не прошла. Проверьте платеж или попробуйте еще раз.");
    }
  } catch {
    // Следующая проверка повторится по таймеру.
  }
}

async function refreshSessionAccessStatus(shouldNotify: boolean) {
  const previousUser = session.user ? { ...session.user } : null;
  await session.load({ silent: true });

  if (shouldNotify && shouldShowAccessClosedAlert(previousUser, session.user)) {
    showTelegramAlert("Доступ к клубу закрыт. Разделы клуба больше недоступны.");
  }
}

function startPaymentWatchPolling() {
  if (paymentWatchTimer) {
    return;
  }

  paymentWatchTimer = window.setInterval(() => {
    void checkPendingPaymentWatch();
  }, 10_000);
}

function startSessionAccessPolling() {
  if (sessionRefreshTimer) {
    return;
  }

  sessionRefreshTimer = window.setInterval(() => {
    void refreshSessionAccessStatus(true);
  }, 15_000);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    void refreshSessionAccessStatus(true);
    void checkPendingPaymentWatch();
  }
}

onMounted(() => {
  window.Telegram?.WebApp?.ready();
  syncTelegramFullscreen(ui.fullscreenEnabled);
  window.visualViewport?.addEventListener("resize", syncViewportHeight);
  window.visualViewport?.addEventListener("scroll", syncViewportHeight);
  window.addEventListener("resize", syncViewportHeight);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  startPaymentWatchPolling();
  void session.load().then(() => {
    startSessionAccessPolling();
    void checkPendingPaymentWatch();
  });
});

watch(
  () => ui.fullscreenEnabled,
  (isEnabled) => {
    syncTelegramFullscreen(isEnabled);
  }
);

watch(
  () => activeSection.value === "community",
  (isCommunity) => {
    syncCommunityLock(isCommunity);
    if (!isCommunity) {
      communityChatOpen.value = false;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  syncCommunityLock(false);
  window.visualViewport?.removeEventListener("resize", syncViewportHeight);
  window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
  window.removeEventListener("resize", syncViewportHeight);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (paymentWatchTimer) {
    window.clearInterval(paymentWatchTimer);
    paymentWatchTimer = null;
  }
  if (sessionRefreshTimer) {
    window.clearInterval(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
  document.documentElement.classList.remove("club-telegram-fullscreen");
  document.body.classList.remove("club-telegram-fullscreen");
});
</script>

<template>
  <main
    class="app-root min-h-screen text-[var(--text)]"
    :class="{
      'nav-is-collapsed': navCollapsed,
      'learning-active': activeSection === 'learning',
      'community-active': activeSection === 'community',
      'community-chat-open': activeSection === 'community' && communityChatOpen
    }"
  >
    <h1 class="sr-only">{{ t("brand") }}</h1>
    <section class="app-shell mx-auto flex min-h-screen w-full max-w-4xl flex-col px-1 py-4 sm:px-6 sm:py-6">
      <div class="content-panel" :class="{ 'content-panel-community': activeSection === 'community' }">
        <div v-if="session.loading" class="text-sm text-[var(--muted)]">{{ t("loading") }}</div>

        <div v-else-if="session.error" class="space-y-3">
          <p class="text-lg font-semibold">{{ t("authTitle") }}</p>
          <p class="text-sm leading-6 text-[var(--muted)]">{{ session.error }}</p>
        </div>

        <div v-else-if="session.user" class="section-host">
          <ProfileSection v-if="activeSection === 'profile'" @open-payments="selectSection('payments')" />
          <LearningSection v-else-if="activeSection === 'learning'" />
          <CommunitySection v-else-if="activeSection === 'community'" @chat-open-change="communityChatOpen = $event" />
          <PaymentsSection v-else-if="activeSection === 'payments'" />
          <SupportSection v-else-if="activeSection === 'support'" />
          <AdminSection v-else />
        </div>
      </div>
    </section>

    <button
      class="bottom-nav-toggle"
      type="button"
      :aria-label="navCollapsed ? 'Показать меню' : 'Свернуть меню'"
      @click="navCollapsed = !navCollapsed"
    >
      <ChevronUp v-if="navCollapsed" class="h-4 w-4" aria-hidden="true" />
      <ChevronDown v-else class="h-4 w-4" aria-hidden="true" />
    </button>

    <nav class="bottom-nav" :class="{ 'bottom-nav-collapsed': navCollapsed }" aria-label="Club sections">
      <button
        v-for="item in visibleNavItems"
        :key="item.id"
        class="bottom-nav-item"
        :class="{ 'bottom-nav-item-active': activeSection === item.id }"
        type="button"
        :aria-pressed="activeSection === item.id"
        @click="selectSection(item.id)"
      >
        <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
        <span>{{ t(item.labelKey) }}</span>
      </button>
    </nav>
  </main>
</template>
