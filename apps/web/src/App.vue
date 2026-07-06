<script setup lang="ts">
import { ChevronDown, ChevronUp } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { getPaymentHistory, getSupportUnreadCount, updateDeviceDiagnostics } from "@/api/client";
import AdminSection from "@/features/admin/AdminSection.vue";
import AuthSection from "@/features/auth/AuthSection.vue";
import PaymentsSection from "@/features/billing/PaymentsSection.vue";
import { shouldShowAccessClosedAlert, shouldShowAccessGrantedAlert } from "@/features/app/accessStatus";
import AppNotifications from "@/features/app/AppNotifications.vue";
import AppOperationIndicator from "@/features/app/AppOperationIndicator.vue";
import PwaInstallPrompt from "@/features/app/PwaInstallPrompt.vue";
import {
  calculateLayoutCalibration,
  collectCurrentDeviceDiagnostics,
  getDesktopViewportMobileScale,
  getDeviceLayoutClasses,
  getMeasuredKeyboardBottomGap,
  getMeasuredViewportWidth,
  getMeasuredVisibleViewportHeight,
  getViewportSizeClasses,
  syncLayoutClasses
} from "@/features/app/deviceLayout";
import { blurActiveTextField, ensureFocusedTextFieldVisible } from "@/features/app/keyboardFocus";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch } from "@/features/billing/paymentWatch";
import CommunitySection from "@/features/community/CommunitySection.vue";
import { useI18n } from "@/features/app/i18n";
import LearningSection from "@/features/learning/LearningSection.vue";
import { navItems, type AppSection } from "@/features/app/navigation";
import ProfileSection from "@/features/profile/ProfileSection.vue";
import SupportSection from "@/features/support/SupportSection.vue";
import { useNotificationsStore } from "@/stores/notifications";
import { useLessonUploadsStore, type LessonUploadTask } from "@/stores/lessonUploads";
import { useSessionStore } from "@/stores/session";
import type { PreviewMode } from "@/stores/ui";

const session = useSessionStore();
const notifications = useNotificationsStore();
const lessonUploads = useLessonUploadsStore();
const { t } = useI18n();
const activeSection = ref<AppSection>("profile");
const navCollapsed = ref(false);
const uploadDetailsOpen = ref(false);
const communityChatOpen = ref(false);
const isDesktopLayout = ref(false);
const isDesktopViewportMobile = ref(false);
const supportUnreadCount = ref(0);
const adminClientTelegramId = ref<string | null>(null);
const supportReturnTicketId = ref<string | null>(null);
const adminClientOpenedFromSupport = ref(false);
let desktopLayoutQuery: MediaQueryList | null = null;
let removeDesktopLayoutListener: (() => void) | null = null;
let paymentWatchTimer: number | null = null;
let sessionRefreshTimer: number | null = null;
let supportUnreadTimer: number | null = null;
let appNotificationTimer: number | null = null;
let deviceDiagnosticsTimer: number | null = null;
let keyboardFocusTimer: number | null = null;
let isAppMounted = false;

function formatUploadBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 МБ";
  }

  const megabytes = bytes / 1024 / 1024;
  if (megabytes < 1024) {
    return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} МБ`;
  }

  return `${(megabytes / 1024).toFixed(1)} ГБ`;
}

function formatUploadSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "скорость считается";
  }

  return `${formatUploadBytes(bytesPerSecond)}/с`;
}

function formatUploadEta(upload: LessonUploadTask) {
  if (upload.status === "saving") {
    return "сохраняем";
  }

  if (upload.status === "error") {
    return "ошибка";
  }

  const remainingBytes = Math.max(0, upload.totalBytes - upload.loadedBytes);
  if (!upload.speedBytesPerSecond || remainingBytes <= 0) {
    return "время считается";
  }

  const seconds = Math.ceil(remainingBytes / upload.speedBytesPerSecond);
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return minutes > 0 ? `~${minutes}м ${restSeconds}с` : `~${restSeconds}с`;
}

function showAppAlert(message: string) {
  notifications.showInfo(message);

  window.alert(message);
}

function showPaymentSuccessAlert() {
  showAppAlert("Оплата прошла. Доступ открыт.");
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
const userDisplayName = computed(() => session.user?.firstName || session.user?.username || t("profileDefaultName"));
const userContact = computed(() => session.user?.email || session.user?.username || session.user?.telegramId || "");
const userInitial = computed(() => userDisplayName.value.trim().slice(0, 1).toUpperCase() || "C");
const membershipLabel = computed(() => {
  if (!session.user) {
    return "";
  }

  return session.user.membershipStatus === "active" ? t("profileAccessActive") : t("profileSubscriptionInactive");
});
const uploadProgressRadius = 23;
const uploadProgressCircumference = Math.round(2 * Math.PI * uploadProgressRadius);
const uploadProgressOffset = computed(() => {
  const progress = lessonUploads.activeUpload?.progress ?? 0;
  return uploadProgressCircumference - (Math.min(100, Math.max(0, progress)) / 100) * uploadProgressCircumference;
});

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

function toggleUploadDetails() {
  uploadDetailsOpen.value = !uploadDetailsOpen.value;
}

function closeUploadDetails() {
  uploadDetailsOpen.value = false;
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

function syncBrowserSafeArea() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty("--club-system-bottom", "0px");
}

function setLayoutCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
  document.body.style.setProperty(name, value);
}

function syncDesktopViewportMobileScale(layoutWidth: number) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const hasTouchInput = Boolean(window.matchMedia?.("(pointer: coarse)").matches || window.navigator.maxTouchPoints > 0);
  const desktopViewportMobileResult = getDesktopViewportMobileScale({
    layoutWidth,
    screenWidth: window.screen?.width ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    hasTouchInput
  });

  isDesktopViewportMobile.value = desktopViewportMobileResult.isDesktopViewportMobile;
  document.documentElement.classList.toggle("club-desktop-viewport-mobile", desktopViewportMobileResult.isDesktopViewportMobile);
  document.body.classList.toggle("club-desktop-viewport-mobile", desktopViewportMobileResult.isDesktopViewportMobile);
  setLayoutCssVariable("--club-mobile-viewport-scale", desktopViewportMobileResult.scale.toFixed(3));
}

function syncPlatformClasses() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const layoutClasses = getDeviceLayoutClasses({
    platform: window.navigator.platform,
    userAgent: window.navigator.userAgent
  });
  syncLayoutClasses([document.documentElement, document.body], layoutClasses);
}

function syncDesktopLayout() {
  if (typeof window === "undefined" || !window.matchMedia) {
    isDesktopLayout.value = false;
    return;
  }

  if (removeDesktopLayoutListener) {
    removeDesktopLayoutListener();
    removeDesktopLayoutListener = null;
  }

  desktopLayoutQuery = window.matchMedia("(min-width: 1024px)");
  const updateDesktopLayout = (event?: MediaQueryListEvent) => {
    isDesktopLayout.value = event?.matches ?? desktopLayoutQuery?.matches ?? false;
  };
  updateDesktopLayout();

  if (desktopLayoutQuery.addEventListener) {
    desktopLayoutQuery.addEventListener("change", updateDesktopLayout);
    removeDesktopLayoutListener = () => desktopLayoutQuery?.removeEventListener("change", updateDesktopLayout);
    return;
  }

  desktopLayoutQuery.addListener(updateDesktopLayout);
  removeDesktopLayoutListener = () => desktopLayoutQuery?.removeListener(updateDesktopLayout);
}

function syncViewportHeight() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? 0;
  const browserHeight = window.innerHeight || 0;
  const browserWidth = window.innerWidth || 0;
  const height = Math.max(visualHeight, browserHeight);
  const width = getMeasuredViewportWidth({
    browserWidth,
    visualWidth: visualViewport?.width ?? null,
    screenWidth: window.screen?.width ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null
  });
  syncDesktopViewportMobileScale(width);

  if (height > 0) {
    document.documentElement.style.setProperty("--club-viewport-height", `${height}px`);
  }
  syncLayoutClasses([document.documentElement, document.body], [
    ...getDeviceLayoutClasses({
      platform: window.navigator.platform,
      userAgent: window.navigator.userAgent
    }),
    ...getViewportSizeClasses({ width, height })
  ]);

  const visibleHeight =
    getMeasuredVisibleViewportHeight({ visualHeight, browserHeight }) || height;
  if (visibleHeight > 0) {
    document.documentElement.style.setProperty("--club-visible-viewport-height", `${visibleHeight}px`);
    const visibleBottom = visualViewport ? Math.round(visualViewport.offsetTop + visibleHeight) : visibleHeight;
    document.documentElement.style.setProperty("--club-visible-viewport-bottom", `${visibleBottom}px`);
  }

  const viewportBaseHeight = Math.max(visualHeight, browserHeight);
  const visualBottomGap = getMeasuredKeyboardBottomGap({
    viewportBaseHeight,
    visibleHeight,
    visibleOffsetTop: visualViewport?.offsetTop ?? 0
  });
  const dynamicBottomInset = visualBottomGap;
  const platform = window.navigator.platform;
  const calibration = calculateLayoutCalibration({
    platform: platform ?? null,
    userAgent: window.navigator.userAgent,
    viewportWidth: width,
    viewportHeight: height,
    safeAreaInset: null,
    contentSafeAreaInset: null,
    visualBottomGap
  });

  document.documentElement.style.setProperty("--club-system-bottom", `${dynamicBottomInset}px`);
  document.documentElement.style.setProperty("--club-keyboard-bottom", `${visualBottomGap}px`);
  setLayoutCssVariable("--club-calibrated-bottom-offset", `${calibration.bottomOffsetPx}px`);
  const isKeyboardOpen = visualBottomGap > 80;
  document.documentElement.classList.toggle("club-keyboard-open", isKeyboardOpen);
  document.body.classList.toggle("club-keyboard-open", isKeyboardOpen);
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
      showPaymentSuccessAlert();
      return;
    }

    const failedOrder = watchedOrders.find((order) => order.status === "failed" || order.status === "cancelled");
    if (failedOrder) {
      clearPaymentWatch();
      showAppAlert("Оплата не прошла. Проверьте платеж или попробуйте еще раз.");
    }
  } catch {
    // Следующая проверка повторится по таймеру.
  }
}

async function refreshSessionAccessStatus(shouldNotify: boolean) {
  const previousUser = session.user ? { ...session.user } : null;
  await session.load({ silent: true });

  if (shouldNotify && shouldShowAccessClosedAlert(previousUser, session.user)) {
    showAppAlert("Доступ к клубу закрыт. Разделы клуба больше недоступны.");
    return;
  }

  if (shouldNotify && shouldShowAccessGrantedAlert(previousUser, session.user)) {
    if (readPaymentWatch()) {
      clearPaymentWatch();
      showPaymentSuccessAlert();
      return;
    }

    showAppAlert("Доступ к клубу открыт.");
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
      showAppAlert("Вам ответили в поддержке.");
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
  syncViewportHeight();
  if (keyboardFocusTimer) {
    window.clearTimeout(keyboardFocusTimer);
  }
  keyboardFocusTimer = window.setTimeout(() => {
    keyboardFocusTimer = null;
    syncViewportHeight();
  }, 360);
}

async function sendDeviceDiagnostics() {
  if (!isAppMounted || typeof window === "undefined" || !session.user) {
    return;
  }

  try {
    await updateDeviceDiagnostics(collectCurrentDeviceDiagnostics());
  } catch {
    // Диагностика не должна мешать запуску приложения.
  }
}

onMounted(() => {
  isAppMounted = true;
  syncPlatformClasses();
  syncBrowserSafeArea();
  syncViewportHeight();
  syncDesktopLayout();
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
    void sendDeviceDiagnostics();
    deviceDiagnosticsTimer = window.setTimeout(() => {
      deviceDiagnosticsTimer = null;
      void sendDeviceDiagnostics();
    }, 1000);
  });
});

watch(
  () => lessonUploads.activeUpload?.status,
  (status) => {
    if (status === "error") {
      uploadDetailsOpen.value = true;
    }
  }
);

watch(
  () => lessonUploads.visibleUploads.length,
  (count) => {
    if (!count) {
      uploadDetailsOpen.value = false;
    }
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
  if (removeDesktopLayoutListener) {
    removeDesktopLayoutListener();
    removeDesktopLayoutListener = null;
  }
  desktopLayoutQuery = null;
  if (keyboardFocusTimer) {
    window.clearTimeout(keyboardFocusTimer);
    keyboardFocusTimer = null;
  }
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
  if (deviceDiagnosticsTimer) {
    window.clearTimeout(deviceDiagnosticsTimer);
    deviceDiagnosticsTimer = null;
  }
  document.documentElement.classList.remove("club-desktop-viewport-mobile");
  document.body.classList.remove("club-desktop-viewport-mobile");
  syncLayoutClasses([document.documentElement, document.body], []);
  document.documentElement.classList.remove("club-keyboard-open");
  document.body.classList.remove("club-keyboard-open");
  document.documentElement.style.removeProperty("--club-calibrated-bottom-offset");
  document.body.style.removeProperty("--club-calibrated-bottom-offset");
  document.documentElement.style.removeProperty("--club-mobile-viewport-scale");
  document.body.style.removeProperty("--club-mobile-viewport-scale");
});
</script>

<template>
  <main
    class="app-root min-h-screen text-[var(--text)]"
    :class="{
      'nav-is-collapsed': navCollapsed,
      'learning-active': activeSection === 'learning',
      'community-active': activeSection === 'community',
      'community-chat-open': activeSection === 'community' && communityChatOpen,
      'app-root-no-user': !session.user
    }"
  >
    <h1 class="sr-only">{{ t("brand") }}</h1>
    <button
      v-if="lessonUploads.visibleUploads.length"
      class="global-upload-indicator"
      :class="{ 'global-upload-indicator-error': lessonUploads.activeUpload?.status === 'error' }"
      type="button"
      aria-label="Открыть статус загрузки"
      @click="toggleUploadDetails"
    >
      <svg viewBox="0 0 56 56" aria-hidden="true">
        <circle class="global-upload-ring-bg" cx="28" cy="28" r="23" />
        <circle
          class="global-upload-ring-progress"
          cx="28"
          cy="28"
          r="23"
          :stroke-dasharray="uploadProgressCircumference"
          :stroke-dashoffset="uploadProgressOffset"
        />
      </svg>
      <span>{{ lessonUploads.activeUpload?.progress ?? 0 }}%</span>
    </button>

    <aside v-if="lessonUploads.visibleUploads.length && uploadDetailsOpen" class="global-upload-panel" aria-label="Статус загрузки урока">
      <div class="global-upload-status-head">
        <span>Загрузка урока</span>
        <em>Не закрывайте и не сворачивайте приложение</em>
        <strong>{{ lessonUploads.activeUpload?.progress ?? 0 }}%</strong>
        <button
          v-if="lessonUploads.activeUpload?.status === 'uploading'"
          class="global-upload-status-cancel"
          type="button"
          @click="lessonUploads.activeUpload && lessonUploads.cancel(lessonUploads.activeUpload.id)"
        >
          Отменить
        </button>
        <button
          class="global-upload-status-toggle"
          type="button"
          aria-label="Закрыть статус загрузки"
          @click="closeUploadDetails"
        >
          <ChevronUp class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div class="global-upload-status-title">
        <strong>{{ lessonUploads.activeUpload?.title }}</strong>
        <button
          v-if="lessonUploads.activeUpload?.status === 'error'"
          class="global-upload-status-close"
          type="button"
          aria-label="Закрыть ошибку загрузки"
          @click="lessonUploads.activeUpload && lessonUploads.remove(lessonUploads.activeUpload.id)"
        >
          Закрыть
        </button>
      </div>
      <div v-if="lessonUploads.activeUpload" class="global-upload-status-meta">
        <span>{{ formatUploadBytes(lessonUploads.activeUpload.loadedBytes) }} / {{ formatUploadBytes(lessonUploads.activeUpload.totalBytes) }}</span>
        <span>{{ formatUploadSpeed(lessonUploads.activeUpload.speedBytesPerSecond) }}</span>
        <span>{{ formatUploadEta(lessonUploads.activeUpload) }}</span>
      </div>
      <div class="global-upload-status-track">
        <span :style="{ width: `${lessonUploads.activeUpload?.progress ?? 0}%` }"></span>
      </div>
    </aside>
    <div class="app-layout" :class="{ 'app-layout-auth': !session.user }">
      <aside v-if="session.user && isDesktopLayout && !isDesktopViewportMobile" class="desktop-sidebar" aria-label="Club sections">
        <div class="desktop-sidebar-brand">
          <span class="desktop-sidebar-logo">C</span>
          <div>
            <strong>{{ t("tagline") }}</strong>
            <span>{{ t("headline") }}</span>
          </div>
        </div>

        <div class="desktop-sidebar-user">
          <span class="desktop-sidebar-avatar">{{ userInitial }}</span>
          <div>
            <strong>{{ userDisplayName }}</strong>
            <span>{{ userContact }}</span>
            <em>{{ membershipLabel }}</em>
          </div>
        </div>

        <nav class="desktop-sidebar-nav" aria-label="Club sections">
          <button
            v-for="item in visibleNavItems"
            :key="`desktop-${item.id}`"
            class="desktop-sidebar-item"
            :class="{ 'desktop-sidebar-item-active': activeSection === item.id }"
            type="button"
            :aria-label="t(item.labelKey)"
            :aria-pressed="activeSection === item.id"
            @click="selectSection(item.id)"
          >
            <component :is="item.icon" class="h-5 w-5" aria-hidden="true" />
            <span>{{ t(item.labelKey) }}</span>
            <span
              v-if="item.id === 'profile' && notifications.unreadCount > 0"
              class="desktop-sidebar-dot"
              aria-label="Есть новые уведомления"
            ></span>
            <span v-if="item.id === 'support' && supportUnreadCount > 0" class="desktop-sidebar-badge">
              {{ supportUnreadCount > 9 ? "9+" : supportUnreadCount }}
            </span>
          </button>
        </nav>
      </aside>

      <section class="app-shell" :class="{ 'app-shell-auth': !session.user }">
        <div
          class="content-panel"
          :class="{ 'content-panel-community': activeSection === 'community', 'content-panel-auth': !session.user }"
        >
          <div v-if="session.loading" class="text-sm text-[var(--muted)]">{{ t("loading") }}</div>

          <AuthSection v-else-if="session.error || !session.user" />

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
    </div>

    <button
      v-if="session.user && (!isDesktopLayout || isDesktopViewportMobile)"
      class="bottom-nav-toggle mobile-bottom-nav-toggle"
      type="button"
      :aria-label="navCollapsed ? 'Показать меню' : 'Свернуть меню'"
      @click="toggleNavCollapsed"
    >
      <ChevronUp v-if="navCollapsed" class="h-4 w-4" aria-hidden="true" />
      <ChevronDown v-else class="h-4 w-4" aria-hidden="true" />
    </button>

    <nav
      v-if="session.user && (!isDesktopLayout || isDesktopViewportMobile)"
      class="bottom-nav mobile-bottom-nav"
      :class="{ 'bottom-nav-collapsed': navCollapsed }"
      aria-label="Club sections"
    >
      <button
        v-for="item in visibleNavItems"
        :key="item.id"
        class="bottom-nav-item"
        :class="{ 'bottom-nav-item-active': activeSection === item.id }"
        type="button"
        :aria-label="t(item.labelKey)"
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
    <PwaInstallPrompt :show-card="Boolean(session.user)" />
  </main>
</template>
