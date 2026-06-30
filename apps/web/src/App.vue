<script setup lang="ts">
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getPaymentHistory, getSupportUnreadCount } from "@/api/client";
import AdminSection from "@/features/admin/AdminSection.vue";
import PaymentsSection from "@/features/billing/PaymentsSection.vue";
import { shouldShowAccessClosedAlert, shouldShowAccessGrantedAlert } from "@/features/app/accessStatus";
import AppNotifications from "@/features/app/AppNotifications.vue";
import AppOperationIndicator from "@/features/app/AppOperationIndicator.vue";
import { blurActiveTextField, ensureFocusedTextFieldVisible } from "@/features/app/keyboardFocus";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch } from "@/features/billing/paymentWatch";
import CommunitySection from "@/features/community/CommunitySection.vue";
import { useI18n } from "@/features/app/i18n";
import LearningSection from "@/features/learning/LearningSection.vue";
import { navItems, type AppSection } from "@/features/app/navigation";
import ProfileSection from "@/features/profile/ProfileSection.vue";
import SupportSection from "@/features/support/SupportSection.vue";
import { useNotificationsStore } from "@/stores/notifications";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";

const session = useSessionStore();
const ui = useUiStore();
const notifications = useNotificationsStore();
const { t } = useI18n();
const activeSection = ref<AppSection>("profile");
const navCollapsed = ref(false);
const communityChatOpen = ref(false);
const supportUnreadCount = ref(0);
const adminClientTelegramId = ref<string | null>(null);
const supportReturnTicketId = ref<string | null>(null);
const adminClientOpenedFromSupport = ref(false);
let paymentWatchTimer: number | null = null;
let sessionRefreshTimer: number | null = null;
let supportUnreadTimer: number | null = null;
let appNotificationTimer: number | null = null;
let isAppMounted = false;

function showTelegramAlert(message: string) {
  notifications.showInfo(message);
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
    return;
  }

  window.alert(message);
}

function isSectionAvailable(item: (typeof navItems)[number]) {
  if (item.adminOnly && session.user?.realRole !== "admin" && session.user?.realRole !== "owner") {
    return false;
  }

  if (item.memberOnly && session.user?.role === "member" && session.user.membershipStatus !== "active") {
    return false;
  }

  return true;
}

const visibleNavItems = computed(() => navItems.filter(isSectionAvailable));

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
  blurActiveTextField();
  const nextItem = navItems.find((item) => item.id === section);
  if (nextItem && !isSectionAvailable(nextItem)) {
    activeSection.value = "profile";
    resetWindowScroll();
    return;
  }

  if (activeSection.value === section) {
    resetWindowScroll();
    return;
  }

  resetWindowScroll();
  activeSection.value = section;
  await nextTick();
  resetWindowScroll();
}

function toggleNavCollapsed() {
  blurActiveTextField();
  navCollapsed.value = !navCollapsed.value;
}

async function openAdminClientFromSupport(telegramId: string, ticketId: string) {
  adminClientTelegramId.value = telegramId;
  supportReturnTicketId.value = ticketId;
  adminClientOpenedFromSupport.value = true;
  await selectSection("admin");
}

async function handleAdminClientCardClose() {
  if (!adminClientOpenedFromSupport.value) {
    return;
  }

  adminClientOpenedFromSupport.value = false;
  adminClientTelegramId.value = null;
  await selectSection("support");
}

function handlePreviewModeChange(mode: PreviewMode) {
  if (mode === "member-active" || mode === "member-inactive") {
    void selectSection("profile");
  }
}

function syncTelegramSafeArea() {
  const webApp = window.Telegram?.WebApp;
  const topInset = Math.max(webApp?.contentSafeAreaInset?.top ?? 0, webApp?.safeAreaInset?.top ?? 0);
  const bottomInset = Math.max(webApp?.contentSafeAreaInset?.bottom ?? 0, webApp?.safeAreaInset?.bottom ?? 0);

  document.documentElement.style.setProperty("--tg-safe-top", `${topInset}px`);
  document.documentElement.style.setProperty("--tg-safe-bottom", `${bottomInset}px`);
  document.documentElement.style.setProperty("--club-system-bottom", `${bottomInset}px`);
}

function syncViewportHeight() {
  const webApp = window.Telegram?.WebApp;
  const telegramHeight = webApp?.viewportHeight || webApp?.viewportStableHeight || 0;
  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? 0;
  const browserHeight = window.innerHeight || 0;
  const height = Math.max(telegramHeight, visualHeight, browserHeight);

  if (height > 0) {
    document.documentElement.style.setProperty("--club-viewport-height", `${height}px`);
  }

  const visualBottomGap =
    visualViewport && browserHeight > 0
      ? Math.max(0, Math.round(browserHeight - visualViewport.height - visualViewport.offsetTop))
      : 0;
  const telegramBottomInset = Math.max(
    webApp?.contentSafeAreaInset?.bottom ?? 0,
    webApp?.safeAreaInset?.bottom ?? 0
  );
  const dynamicBottomInset = Math.max(telegramBottomInset, visualBottomGap);

  document.documentElement.style.setProperty("--club-system-bottom", `${dynamicBottomInset}px`);
  document.documentElement.style.setProperty("--club-keyboard-bottom", `${visualBottomGap}px`);
  document.documentElement.classList.toggle("club-keyboard-open", visualBottomGap > 80);
  document.body.classList.toggle("club-keyboard-open", visualBottomGap > 80);
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
    return;
  }

  if (shouldNotify && shouldShowAccessGrantedAlert(previousUser, session.user)) {
    showTelegramAlert("Доступ к клубу открыт.");
  }
}

async function refreshSupportUnread(shouldNotify: boolean) {
  if (!session.user) {
    supportUnreadCount.value = 0;
    return;
  }

  const previousCount = supportUnreadCount.value;
  try {
    const response = await getSupportUnreadCount();
    supportUnreadCount.value = response.unreadCount;

    const isAdmin = session.user.realRole === "admin" || session.user.realRole === "owner";
    if (shouldNotify && !isAdmin && activeSection.value !== "support" && response.unreadCount > previousCount) {
      showTelegramAlert("Вам ответили в поддержке.");
    }
  } catch {
    // Следующая проверка повторится по таймеру.
  }
}

function startPaymentWatchPolling() {
  if (!isAppMounted || typeof window === "undefined" || paymentWatchTimer) {
    return;
  }

  paymentWatchTimer = window.setInterval(() => {
    void checkPendingPaymentWatch();
  }, 10_000);
}

function startSessionAccessPolling() {
  if (!isAppMounted || typeof window === "undefined" || sessionRefreshTimer) {
    return;
  }

  sessionRefreshTimer = window.setInterval(() => {
    void refreshSessionAccessStatus(true);
  }, 15_000);
}

function startSupportUnreadPolling() {
  if (!isAppMounted || typeof window === "undefined" || supportUnreadTimer) {
    return;
  }

  supportUnreadTimer = window.setInterval(() => {
    void refreshSupportUnread(true);
  }, 15_000);
}

function startAppNotificationPolling() {
  if (!isAppMounted || typeof window === "undefined" || appNotificationTimer) {
    return;
  }

  appNotificationTimer = window.setInterval(() => {
    void notifications.loadAppNotifications();
  }, 10_000);
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    void refreshSessionAccessStatus(true);
    void checkPendingPaymentWatch();
    void refreshSupportUnread(true);
    void notifications.loadAppNotifications();
  }
}

function handleTextFieldFocusIn(event: FocusEvent) {
  ensureFocusedTextFieldVisible(event.target instanceof Element ? event.target : null);
}

onMounted(() => {
  isAppMounted = true;
  window.Telegram?.WebApp?.ready();
  syncTelegramFullscreen(ui.fullscreenEnabled);
  window.visualViewport?.addEventListener("resize", syncViewportHeight);
  window.visualViewport?.addEventListener("scroll", syncViewportHeight);
  window.addEventListener("resize", syncViewportHeight);
  document.addEventListener("focusin", handleTextFieldFocusIn);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  startPaymentWatchPolling();
  void session.load().then(() => {
    if (!isAppMounted || typeof window === "undefined") {
      return;
    }

    startSessionAccessPolling();
    startSupportUnreadPolling();
    startAppNotificationPolling();
    void refreshSupportUnread(false);
    void notifications.loadAppNotifications();
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

watch(
  () => [session.user?.role, session.user?.membershipStatus, activeSection.value] as const,
  () => {
    const currentItem = navItems.find((item) => item.id === activeSection.value);
    if (currentItem && !isSectionAvailable(currentItem)) {
      void selectSection("profile");
    }
  }
);

onBeforeUnmount(() => {
  isAppMounted = false;
  syncCommunityLock(false);
  window.visualViewport?.removeEventListener("resize", syncViewportHeight);
  window.visualViewport?.removeEventListener("scroll", syncViewportHeight);
  window.removeEventListener("resize", syncViewportHeight);
  document.removeEventListener("focusin", handleTextFieldFocusIn);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (paymentWatchTimer) {
    window.clearInterval(paymentWatchTimer);
    paymentWatchTimer = null;
  }
  if (sessionRefreshTimer) {
    window.clearInterval(sessionRefreshTimer);
    sessionRefreshTimer = null;
  }
  if (supportUnreadTimer) {
    window.clearInterval(supportUnreadTimer);
    supportUnreadTimer = null;
  }
  if (appNotificationTimer) {
    window.clearInterval(appNotificationTimer);
    appNotificationTimer = null;
  }
  document.documentElement.classList.remove("club-telegram-fullscreen");
  document.body.classList.remove("club-telegram-fullscreen");
  document.documentElement.classList.remove("club-keyboard-open");
  document.body.classList.remove("club-keyboard-open");
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
          <SupportSection
            v-else-if="activeSection === 'support'"
            :open-ticket-id="supportReturnTicketId"
            @unread-change="supportUnreadCount = $event"
            @open-client="openAdminClientFromSupport"
            @return-ticket-consumed="supportReturnTicketId = null"
          />
          <AdminSection
            v-else
            :open-client-telegram-id="adminClientTelegramId"
            @client-card-close="handleAdminClientCardClose"
            @preview-mode-change="handlePreviewModeChange"
          />
        </div>
      </div>
    </section>

    <button
      class="bottom-nav-toggle"
      type="button"
      :aria-label="navCollapsed ? 'Показать меню' : 'Свернуть меню'"
      @click="toggleNavCollapsed"
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
        <span v-if="item.id === 'profile' && notifications.unreadCount > 0" class="bottom-nav-mail-badge" aria-label="Есть новые уведомления">
          <span aria-hidden="true">✉</span>
        </span>
        <span v-if="item.id === 'support' && supportUnreadCount > 0" class="bottom-nav-badge">
          {{ supportUnreadCount > 9 ? "9+" : supportUnreadCount }}
        </span>
        <span>{{ t(item.labelKey) }}</span>
      </button>
    </nav>
    <AppOperationIndicator />
    <AppNotifications />
  </main>
</template>
