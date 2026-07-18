<script setup lang="ts">
import { ChevronUp } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getAppState, getPaymentHistory, updateDeviceDiagnostics } from "@/api/client";
import AdminSection from "@/features/admin/AdminSection.vue";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";
import { getVisibleAdminPanels } from "@/features/admin/adminPanels";
import AuthSection from "@/features/auth/AuthSection.vue";
import PaymentsSection from "@/features/billing/PaymentsSection.vue";
import { shouldShowAccessClosedAlert, shouldShowAccessGrantedAlert } from "@/features/app/accessStatus";
import AppNotifications from "@/features/app/AppNotifications.vue";
import AppDialogHost from "@/features/app/AppDialogHost.vue";
import DeviceModeNotice from "@/features/app/DeviceModeNotice.vue";
import NotificationCenterScreen from "@/features/app/NotificationCenterScreen.vue";
import AppOperationIndicator from "@/features/app/AppOperationIndicator.vue";
import PwaInstallPrompt from "@/features/app/PwaInstallPrompt.vue";
import PushPermissionPrompt from "@/features/app/PushPermissionPrompt.vue";
import {
  calculateLayoutCalibration,
  collectCurrentDeviceDiagnostics,
  createDeviceLayoutSnapshot,
  deviceLayoutCssVariables,
  getKeyboardViewportBaseHeight,
  getMeasuredKeyboardBottomGap,
  getMeasuredKeyboardOcclusion,
  getMeasuredSystemBottomGap,
  getMeasuredViewportWidth,
  getMeasuredVisibleViewportHeight,
  syncLayoutClasses
} from "@/features/app/deviceLayout";
import {
  classifyDeviceMode,
  getDeviceModeNoticeKind,
  getSafeQrTarget,
  shouldForceMobilePresentation,
  type DeviceMode,
  type DeviceModeNoticeKind
} from "@/features/app/deviceMode";
import {
  blurActiveTextField,
  ensureFocusedTextFieldVisible,
  isTextFieldElement,
  keepActiveSupportFieldVisible
} from "@/features/app/keyboardFocus";
import { clearPaymentWatch, isOrderWithinPaymentWatch, readPaymentWatch } from "@/features/billing/paymentWatch";
import CommunitySection from "@/features/community/CommunitySection.vue";
import { useI18n } from "@/features/app/i18n";
import { useInterfaceLocalization } from "@/features/app/interfaceLocalization";
import LearningSection from "@/features/learning/LearningSection.vue";
import { mobilePrimaryNavIds, navItems, type AppSection } from "@/features/app/navigation";
import { isTaskPath, sectionFromPath, sectionPath } from "@/features/app/taskNavigation";
import { isInstalledPwaDisplay } from "@/features/app/pwaDisplay";
import {
  createViewportSyncScheduler,
  stabilizeViewportMetric,
  type ViewportSyncScheduler
} from "@/features/app/viewportStability";
import ProfileSection from "@/features/profile/ProfileSection.vue";
import SupportSection from "@/features/support/SupportSection.vue";
import { useNotificationsStore } from "@/stores/notifications";
import { useLessonUploadsStore, type LessonUploadTask } from "@/stores/lessonUploads";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type PreviewMode } from "@/stores/ui";

const session = useSessionStore();
useUiStore();
const notifications = useNotificationsStore();
const lessonUploads = useLessonUploadsStore();
const { currentLocale, t } = useI18n();
useInterfaceLocalization(currentLocale);
const route = useRoute();
const router = useRouter();
const activeSection = computed<AppSection>(() => sectionFromPath(route.path));
const uploadDetailsOpen = ref(false);
const communityChatOpen = ref(false);
const isDesktopLayout = ref(false);
const isMobileDeviceShell = ref(false);
const deviceMode = ref<DeviceMode>("unknown");
const isStandaloneDeviceDisplay = ref(false);
const continuedDeviceNoticeKind = ref<DeviceModeNoticeKind | null>(null);
const supportUnreadCount = ref(0);
const supportClientTelegramId = computed(() =>
  route.path.includes("/clients/") && typeof route.params.customerId === "string" ? route.params.customerId : null
);
const supportClientTicketId = computed(() =>
  route.path.includes("/clients/") && typeof route.params.ticketId === "string" ? route.params.ticketId : null
);
let desktopLayoutQuery: MediaQueryList | null = null;
let removeDesktopLayoutListener: (() => void) | null = null;
let paymentWatchTimer: number | null = null;
let appStateTimer: number | null = null;
let appStateRefreshPromise: Promise<void> | null = null;
let deviceDiagnosticsTimer: number | null = null;
let keyboardFocusTimer: number | null = null;
let keyboardFocusReleaseTimer: number | null = null;
let keyboardAnimationTimers: number[] = [];
let viewportSyncScheduler: ViewportSyncScheduler | null = null;
let appliedViewportHeight = 0;
let appliedVisibleViewportHeight = 0;
let appliedVisibleViewportTop = 0;
let appliedVisibleViewportBottom = 0;
let appliedSystemBottomGap = 0;
let appliedKeyboardBottomGap = 0;
let keyboardViewportBaseHeight = 0;
let keyboardWasOpen = false;
let isAppMounted = false;
const backgroundPollingIntervalMs = 30_000;
const pollingJitterMaxMs = 5_000;
const modalPageGestureSurfaceSelector = [
  ".admin-modal-backdrop",
  ".payment-modal-backdrop",
  ".support-modal-backdrop",
  ".profile-modal-backdrop",
  ".notification-center-backdrop",
  ".app-dialog-backdrop",
  ".push-permission-layer"
].join(", ");
const modalPageGestureAllowedSelector = ".profile-avatar-gesture-stage";
const modalPageGestureListenerOptions = { capture: true, passive: false } as const;

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

function formatUploadFailureTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function showAppAlert(message: string) {
  notifications.showInfo(message);
}

function showPaymentSuccessAlert() {
  showAppAlert("Оплата прошла. Доступ открыт.");
}

function isSectionAvailable(item: (typeof navItems)[number]) {
  if (item.adminOnly) {
    if (!session.user || (session.user.realRole !== "admin" && session.user.realRole !== "owner")) {
      return false;
    }

    if (
      session.user.realRole === "admin" &&
      getVisibleAdminPanels(session.user.realRole, session.user.adminPermissions).length === 0
    ) {
      return false;
    }
  }

  if (item.memberOnly && session.user?.role === "member" && session.user.membershipStatus !== "active") {
    return false;
  }

  return true;
}

const visibleNavItems = computed(() => navItems.filter(isSectionAvailable));
const mobileNavItems = computed(() => navItems.filter((item) => mobilePrimaryNavIds.includes(item.id)));
const visibleMobileNavItems = computed(() => mobileNavItems.value.filter(isSectionAvailable));
const showDesktopNavigation = computed(() => Boolean(session.user && isDesktopLayout.value && !isMobileDeviceShell.value));
const showMobileNavigation = computed(() => Boolean(session.user && (!isDesktopLayout.value || isMobileDeviceShell.value)));
const showBottomNavigation = computed(
  () => showMobileNavigation.value && !isTaskPath(route.path) && (activeSection.value !== "community" || !communityChatOpen.value)
);
const deviceModeNoticeKind = computed(() =>
  getDeviceModeNoticeKind(deviceMode.value, isStandaloneDeviceDisplay.value)
);
const visibleDeviceModeNoticeKind = computed(() =>
  deviceModeNoticeKind.value && continuedDeviceNoticeKind.value !== deviceModeNoticeKind.value
    ? deviceModeNoticeKind.value
    : null
);
const deviceQrTarget = computed(() =>
  typeof window === "undefined" ? "" : getSafeQrTarget(window.location.href)
);
const usesDesktopMobilePreview = computed(() => deviceMode.value === "desktop");
const deviceNoticeSessionKey = "club-device-mode-notice-continued";

function hasContinuedDeviceNotice(kind: DeviceModeNoticeKind | null) {
  if (!kind || typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(deviceNoticeSessionKey) === kind;
  } catch {
    return false;
  }
}

function continueDeviceModeNotice() {
  const kind = deviceModeNoticeKind.value;
  if (!kind) {
    return;
  }

  continuedDeviceNoticeKind.value = kind;
  try {
    window.sessionStorage.setItem(deviceNoticeSessionKey, kind);
  } catch {
    // The warning can still be dismissed when session storage is unavailable.
  }
}
const userDisplayName = computed(
  () => session.user?.displayName || session.user?.firstName || session.user?.username || t("profileDefaultName")
);
const userContact = computed(() => session.user?.email || session.user?.username || session.user?.telegramId || "");
const userInitial = computed(() => userDisplayName.value.trim().slice(0, 1).toUpperCase() || "C");
const userAvatarStyle = computed(() => {
  const positionX = session.user?.avatarPositionX ?? 50;
  const positionY = session.user?.avatarPositionY ?? 50;
  const scale = session.user?.avatarScale ?? 1;

  return {
    objectPosition: `${positionX}% ${positionY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${positionX}% ${positionY}%`
  };
});
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

function shouldPreventModalPageGesture(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(modalPageGestureSurfaceSelector)) {
    return false;
  }

  return !target.closest(modalPageGestureAllowedSelector);
}

function preventModalPagePinch(event: TouchEvent) {
  if (event.touches.length < 2 || !shouldPreventModalPageGesture(event)) {
    return;
  }

  event.preventDefault();
}

function preventModalWebKitGesture(event: Event) {
  if (!shouldPreventModalPageGesture(event)) {
    return;
  }

  event.preventDefault();
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
    void router.replace(sectionPath("profile"));
    resetWindowScroll();
    return;
  }

  if (route.path === sectionPath(section)) {
    resetWindowScroll();
    return;
  }

  resetWindowScroll();
  void router.push(sectionPath(section));
  await nextTick();
  resetWindowScroll();
}

function toggleUploadDetails() {
  uploadDetailsOpen.value = !uploadDetailsOpen.value;
}

function closeUploadDetails() {
  uploadDetailsOpen.value = false;
}

async function openAdminClientFromSupport(telegramId: string, ticketId: string) {
  await router.push(
    `/support/tickets/${encodeURIComponent(ticketId)}/clients/${encodeURIComponent(telegramId)}`
  );
}

async function handleAdminClientCardClose() {
  const ticketId = supportClientTicketId.value;
  await router.push(ticketId ? `/support/tickets/${encodeURIComponent(ticketId)}` : "/support");
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

function removeLayoutCssVariable(name: string) {
  document.documentElement.style.removeProperty(name);
  document.body.style.removeProperty(name);
}

function syncMobileDeviceShell(layoutWidth: number, viewportHeight: number) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const pointerCoarse = Boolean(window.matchMedia?.("(pointer: coarse)").matches);
  const pointerFine = Boolean(window.matchMedia?.("(pointer: fine)").matches);
  const hasTouchInput = Boolean(pointerCoarse || window.navigator.maxTouchPoints > 0);
  const standaloneDisplay = isInstalledPwaDisplay();
  const navigatorWithHints = window.navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  const modeResult = classifyDeviceMode({
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    userAgentDataMobile:
      typeof navigatorWithHints.userAgentData?.mobile === "boolean"
        ? navigatorWithHints.userAgentData.mobile
        : null,
    maxTouchPoints: window.navigator.maxTouchPoints,
    pointerCoarse,
    pointerFine,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    screenAvailHeight: window.screen?.availHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    layoutWidth,
    layoutHeight: viewportHeight,
    isStandaloneDisplay: standaloneDisplay
  });
  deviceMode.value = modeResult.mode;
  isStandaloneDeviceDisplay.value = standaloneDisplay;
  const nextNoticeKind = getDeviceModeNoticeKind(modeResult.mode, standaloneDisplay);
  continuedDeviceNoticeKind.value = hasContinuedDeviceNotice(nextNoticeKind) ? nextNoticeKind : null;
  const snapshot = createDeviceLayoutSnapshot({
    layoutWidth,
    viewportHeight,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    screenAvailHeight: window.screen?.availHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    hasTouchInput,
    isStandaloneDisplay: standaloneDisplay,
    platform: window.navigator.platform,
    sessionMode: session.user ? "signed-in" : "signed-out",
    userAgent: window.navigator.userAgent,
    forceMobileShell: shouldForceMobilePresentation(modeResult.mode)
  });

  isMobileDeviceShell.value = snapshot.isMobileDeviceShell;
  syncLayoutClasses([document.documentElement, document.body], snapshot.classes);

  for (const [name, value] of Object.entries(snapshot.cssVariables)) {
    setLayoutCssVariable(name, value);
  }

  for (const name of snapshot.removedCssVariables) {
    removeLayoutCssVariable(name);
  }
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
    screenHeight: window.screen?.height ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    screenAvailHeight: window.screen?.availHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null
  });
  syncMobileDeviceShell(width, height);

  if (height > 0) {
    appliedViewportHeight = stabilizeViewportMetric(appliedViewportHeight, height);
    document.documentElement.style.setProperty("--club-viewport-height", `${appliedViewportHeight}px`);
  }

  const visibleHeight =
    getMeasuredVisibleViewportHeight({ visualHeight, browserHeight }) || height;
  if (visibleHeight > 0) {
    appliedVisibleViewportHeight = stabilizeViewportMetric(appliedVisibleViewportHeight, visibleHeight);
    document.documentElement.style.setProperty("--club-visible-viewport-height", `${appliedVisibleViewportHeight}px`);
    const visibleTop = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
    appliedVisibleViewportTop = stabilizeViewportMetric(appliedVisibleViewportTop, visibleTop);
    document.documentElement.style.setProperty("--club-visible-viewport-top", `${appliedVisibleViewportTop}px`);
    const visibleBottom = visualViewport ? Math.round(visualViewport.offsetTop + visibleHeight) : visibleHeight;
    appliedVisibleViewportBottom = stabilizeViewportMetric(appliedVisibleViewportBottom, visibleBottom);
    document.documentElement.style.setProperty("--club-visible-viewport-bottom", `${appliedVisibleViewportBottom}px`);
  }

  const hasFocusedTextField = isTextFieldElement(document.activeElement);
  const currentViewportHeight = Math.max(visualHeight, browserHeight);
  keyboardViewportBaseHeight = getKeyboardViewportBaseHeight({
    previousBaseHeight: keyboardViewportBaseHeight,
    currentViewportHeight,
    hasFocusedTextField
  });
  const viewportBaseHeight = Math.max(keyboardViewportBaseHeight, currentViewportHeight);
  const visualBottomGap = getMeasuredKeyboardBottomGap({
    viewportBaseHeight,
    visibleHeight,
    visibleOffsetTop: visualViewport?.offsetTop ?? 0
  });
  const keyboardOcclusion = getMeasuredKeyboardOcclusion({
    viewportBaseHeight,
    visibleHeight,
    visibleOffsetTop: visualViewport?.offsetTop ?? 0
  });
  const keyboardThreshold = keyboardWasOpen ? 56 : 96;
  const isKeyboardOpen = keyboardOcclusion > keyboardThreshold && hasFocusedTextField;
  keyboardWasOpen = isKeyboardOpen;
  const systemBottomGap = getMeasuredSystemBottomGap({ keyboardOpen: isKeyboardOpen, visualBottomGap });
  const platform = window.navigator.platform;
  const calibration = calculateLayoutCalibration({
    platform: platform ?? null,
    userAgent: window.navigator.userAgent,
    viewportWidth: width,
    viewportHeight: height,
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    screenAvailWidth: window.screen?.availWidth ?? null,
    screenAvailHeight: window.screen?.availHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    safeAreaInset: null,
    contentSafeAreaInset: null,
    visualBottomGap: systemBottomGap
  });

  appliedSystemBottomGap = stabilizeViewportMetric(appliedSystemBottomGap, systemBottomGap);
  appliedKeyboardBottomGap = stabilizeViewportMetric(appliedKeyboardBottomGap, keyboardOcclusion);
  document.documentElement.style.setProperty("--club-system-bottom", `${appliedSystemBottomGap}px`);
  document.documentElement.style.setProperty("--club-keyboard-bottom", `${appliedKeyboardBottomGap}px`);
  setLayoutCssVariable("--club-calibrated-bottom-offset", `${calibration.bottomOffsetPx}px`);
  document.documentElement.classList.toggle("club-keyboard-open", isKeyboardOpen);
  document.body.classList.toggle("club-keyboard-open", isKeyboardOpen);
  if (isKeyboardOpen) {
    keepActiveSupportFieldVisible();
  }
}

function scheduleViewportHeightSync() {
  viewportSyncScheduler?.schedule();
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

async function performAppStateRefresh(shouldNotify: boolean) {
  if (!session.user) {
    supportUnreadCount.value = 0;
    return;
  }

  const previousUser = { ...session.user };
  const previousCount = supportUnreadCount.value;
  try {
    const response = await getAppState();
    session.applyAppState(response.access);
    notifications.setUnreadCount(response.notificationUnreadCount);
    supportUnreadCount.value = response.supportUnreadCount;

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

    const isAdmin = hasAdminCapability(session.user.realRole, session.user.adminPermissions, "support");
    if (shouldNotify && !isAdmin && activeSection.value !== "support" && response.supportUnreadCount > previousCount) {
      showAppAlert("Вам ответили в поддержке.");
    }
  } catch {
    // Следующая проверка повторится по таймеру.
  }
}

function refreshAppState(shouldNotify: boolean) {
  if (appStateRefreshPromise) {
    return appStateRefreshPromise;
  }
  appStateRefreshPromise = performAppStateRefresh(shouldNotify).finally(() => {
    appStateRefreshPromise = null;
  });
  return appStateRefreshPromise;
}

function startPaymentWatchPolling() {
  if (!isAppMounted || typeof window === "undefined" || paymentWatchTimer) {
    return;
  }

  paymentWatchTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }
    void checkPendingPaymentWatch();
  }, 10_000);
}

function withPollingJitter(baseIntervalMs: number) {
  return baseIntervalMs + Math.floor(Math.random() * pollingJitterMaxMs);
}

function startAppStatePolling() {
  if (!isAppMounted || typeof window === "undefined" || appStateTimer) {
    return;
  }

  appStateTimer = window.setInterval(() => {
    if (document.visibilityState !== "visible") {
      return;
    }
    void refreshAppState(true);
  }, withPollingJitter(backgroundPollingIntervalMs));
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    void refreshAppState(true);
    void checkPendingPaymentWatch();
  }
}

function handleTextFieldFocusIn(event: FocusEvent) {
  const target = event.target instanceof Element ? event.target : null;
  ensureFocusedTextFieldVisible(target);
  if (!isTextFieldElement(target)) {
    return;
  }

  if (keyboardFocusReleaseTimer) {
    window.clearTimeout(keyboardFocusReleaseTimer);
    keyboardFocusReleaseTimer = null;
  }
  document.documentElement.classList.add("club-text-field-focused");
  document.body.classList.add("club-text-field-focused");
  viewportSyncScheduler?.flush();
  if (keyboardFocusTimer) {
    window.clearTimeout(keyboardFocusTimer);
  }
  keyboardAnimationTimers.forEach((timer) => window.clearTimeout(timer));
  keyboardAnimationTimers = [40, 120, 240, 520].map((delay) =>
    window.setTimeout(() => viewportSyncScheduler?.flush(), delay)
  );
  keyboardFocusTimer = window.setTimeout(() => {
    keyboardFocusTimer = null;
    viewportSyncScheduler?.flush();
  }, 360);
}

function handleTextFieldFocusOut() {
  if (keyboardFocusReleaseTimer) {
    window.clearTimeout(keyboardFocusReleaseTimer);
  }
  keyboardFocusReleaseTimer = window.setTimeout(() => {
    keyboardFocusReleaseTimer = null;
    if (isTextFieldElement(document.activeElement)) {
      return;
    }
    document.documentElement.classList.remove("club-text-field-focused");
    document.body.classList.remove("club-text-field-focused");
    viewportSyncScheduler?.flush();
  }, 180);
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
  viewportSyncScheduler = createViewportSyncScheduler(syncViewportHeight, {
    requestFrame: (handler) => window.requestAnimationFrame(handler),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle),
    setTimer: (handler, delay) => window.setTimeout(handler, delay),
    clearTimer: (handle) => window.clearTimeout(handle),
    trailingDelayMs: 120
  });
  syncBrowserSafeArea();
  syncViewportHeight();
  syncDesktopLayout();
  window.visualViewport?.addEventListener("resize", scheduleViewportHeightSync);
  window.visualViewport?.addEventListener("scroll", scheduleViewportHeightSync);
  window.addEventListener("resize", scheduleViewportHeightSync);
  window.addEventListener("orientationchange", scheduleViewportHeightSync);
  window.addEventListener("touchmove", preventModalPagePinch, modalPageGestureListenerOptions);
  window.addEventListener("gesturestart", preventModalWebKitGesture, modalPageGestureListenerOptions);
  window.addEventListener("gesturechange", preventModalWebKitGesture, modalPageGestureListenerOptions);
  document.addEventListener("focusin", handleTextFieldFocusIn);
  document.addEventListener("focusout", handleTextFieldFocusOut);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  startPaymentWatchPolling();
  void session.load().then(() => {
    if (!isAppMounted || typeof window === "undefined") {
      return;
    }

    startAppStatePolling();
    void refreshAppState(false);
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
  () => [
    session.user?.role,
    session.user?.realRole,
    session.user?.membershipStatus,
    session.user?.adminPermissions.join("|"),
    route.path
  ] as const,
  () => {
    const currentItem = navItems.find((item) => item.id === activeSection.value);
    const adminRouteDenied = Boolean(route.meta.adminOnly && session.user && session.user.realRole !== "admin" && session.user.realRole !== "owner");
    if (session.user && (adminRouteDenied || (currentItem && !isSectionAvailable(currentItem)))) {
      void router.replace(sectionPath("profile"));
    }
  }
);

watch(
  () => Boolean(session.user),
  () => {
    syncViewportHeight();
  }
);

onBeforeUnmount(() => {
  isAppMounted = false;
  syncCommunityLock(false);
  window.visualViewport?.removeEventListener("resize", scheduleViewportHeightSync);
  window.visualViewport?.removeEventListener("scroll", scheduleViewportHeightSync);
  window.removeEventListener("resize", scheduleViewportHeightSync);
  window.removeEventListener("orientationchange", scheduleViewportHeightSync);
  viewportSyncScheduler?.cancel();
  viewportSyncScheduler = null;
  window.removeEventListener("touchmove", preventModalPagePinch, true);
  window.removeEventListener("gesturestart", preventModalWebKitGesture, true);
  window.removeEventListener("gesturechange", preventModalWebKitGesture, true);
  document.removeEventListener("focusin", handleTextFieldFocusIn);
  document.removeEventListener("focusout", handleTextFieldFocusOut);
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
  if (keyboardFocusReleaseTimer) {
    window.clearTimeout(keyboardFocusReleaseTimer);
    keyboardFocusReleaseTimer = null;
  }
  keyboardAnimationTimers.forEach((timer) => window.clearTimeout(timer));
  keyboardAnimationTimers = [];
  document.documentElement.classList.remove("club-text-field-focused");
  document.body.classList.remove("club-text-field-focused");
  if (paymentWatchTimer) {
    window.clearInterval(paymentWatchTimer);
    paymentWatchTimer = null;
  }
  if (appStateTimer) {
    window.clearInterval(appStateTimer);
    appStateTimer = null;
  }
  if (deviceDiagnosticsTimer) {
    window.clearTimeout(deviceDiagnosticsTimer);
    deviceDiagnosticsTimer = null;
  }
  syncLayoutClasses([document.documentElement, document.body], []);
  document.documentElement.classList.remove("club-keyboard-open");
  document.body.classList.remove("club-keyboard-open");
  document.documentElement.style.removeProperty("--club-calibrated-bottom-offset");
  document.body.style.removeProperty("--club-calibrated-bottom-offset");
  for (const variableName of deviceLayoutCssVariables) {
    removeLayoutCssVariable(variableName);
  }
});
</script>

<template>
  <main
    class="app-root ui-app-shell min-h-screen text-[var(--text)]"
    :class="{
      'learning-active': activeSection === 'learning',
      'community-active': activeSection === 'community',
      'community-chat-open': activeSection === 'community' && communityChatOpen,
      'app-root-no-user': !session.user,
      'mobile-device-shell': isMobileDeviceShell,
      'desktop-mobile-preview': usesDesktopMobilePreview
    }"
  >
    <DeviceModeNotice
      v-if="visibleDeviceModeNoticeKind"
      :kind="visibleDeviceModeNoticeKind"
      :qr-target="deviceQrTarget"
      @continue="continueDeviceModeNotice"
    />
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
          @click="lessonUploads.activeUpload && lessonUploads.dismiss(lessonUploads.activeUpload.id)"
        >
          Закрыть
        </button>
      </div>
      <div v-if="lessonUploads.activeUpload" class="global-upload-status-meta">
        <span>{{ formatUploadBytes(lessonUploads.activeUpload.loadedBytes) }} / {{ formatUploadBytes(lessonUploads.activeUpload.totalBytes) }}</span>
        <span>{{ formatUploadSpeed(lessonUploads.activeUpload.speedBytesPerSecond) }}</span>
        <span>{{ formatUploadEta(lessonUploads.activeUpload) }}</span>
      </div>
      <div
        v-if="lessonUploads.activeUpload?.failure"
        class="global-upload-status-error-detail"
        role="alert"
      >
        <strong>{{ lessonUploads.activeUpload.failure.title }}</strong>
        <p>{{ lessonUploads.activeUpload.failure.detail }}</p>
        <dl>
          <div>
            <dt>Этап</dt>
            <dd>{{ lessonUploads.activeUpload.failure.stage }}</dd>
          </div>
          <div>
            <dt>Код</dt>
            <dd>{{ lessonUploads.activeUpload.failure.code }}</dd>
          </div>
          <div>
            <dt>Попытки</dt>
            <dd>{{ lessonUploads.activeUpload.failure.attempts }}</dd>
          </div>
          <div>
            <dt>Время</dt>
            <dd>{{ formatUploadFailureTime(lessonUploads.activeUpload.failure.failedAt) }}</dd>
          </div>
        </dl>
        <button
          v-if="lessonUploads.activeUpload.retry"
          class="global-upload-status-retry"
          type="button"
          @click="lessonUploads.retry(lessonUploads.activeUpload.id)"
        >
          Продолжить загрузку
        </button>
      </div>
      <div class="global-upload-status-track">
        <span :style="{ width: `${lessonUploads.activeUpload?.progress ?? 0}%` }"></span>
      </div>
    </aside>
    <div class="app-layout" :class="{ 'app-layout-auth': !session.user }">
      <aside v-if="showDesktopNavigation" class="desktop-sidebar" aria-label="Club sections">
        <div class="desktop-sidebar-brand">
          <span class="desktop-sidebar-logo">
            <img class="desktop-sidebar-logo-image" src="/icons/icon-192.png" alt="" />
          </span>
          <strong>{{ t("tagline") }}</strong>
        </div>

        <div class="desktop-sidebar-user">
          <span class="desktop-sidebar-avatar">
            <img
              v-if="session.user?.photoUrl"
              class="desktop-sidebar-avatar-image"
              :src="session.user.photoUrl"
              :alt="userDisplayName"
              :style="userAvatarStyle"
            />
            <span v-else>{{ userInitial }}</span>
          </span>
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

      <section class="app-shell ui-page-container" :class="{ 'app-shell-auth': !session.user, 'ui-page-container--with-bottom-nav': showBottomNavigation }">
        <div
          class="content-panel"
          :class="{ 'content-panel-community': activeSection === 'community', 'content-panel-auth': !session.user }"
        >
          <div v-if="!session.initialized && !session.pendingEmail" class="text-sm text-[var(--muted)]">{{ t("loading") }}</div>

          <AuthSection v-else-if="session.error || !session.user" />

          <div v-else-if="session.user" class="section-host">
            <NotificationCenterScreen v-if="route.path === '/notifications'" />
            <ProfileSection v-else-if="activeSection === 'profile'" @open-payments="selectSection('payments')" />
            <LearningSection v-else-if="activeSection === 'learning'" />
            <CommunitySection v-else-if="activeSection === 'community'" @chat-open-change="communityChatOpen = $event" />
            <PaymentsSection v-else-if="activeSection === 'payments'" />
            <template v-else-if="activeSection === 'support'">
              <SupportSection
                @unread-change="supportUnreadCount = $event"
                @open-client="openAdminClientFromSupport"
              />
              <AdminSection
                v-if="supportClientTelegramId"
                :open-client-telegram-id="supportClientTelegramId"
                client-card-only
                @client-card-close="handleAdminClientCardClose"
              />
            </template>
            <AdminSection v-else @preview-mode-change="handlePreviewModeChange" />
          </div>
        </div>
      </section>
    </div>

    <nav
      v-if="showBottomNavigation"
      class="bottom-nav mobile-bottom-nav"
      :class="{ 'bottom-nav-admin': visibleMobileNavItems.length > 5 }"
      aria-label="Club sections"
    >
      <button
        v-for="item in visibleMobileNavItems"
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
    <AppDialogHost />
    <AppOperationIndicator />
    <AppNotifications />
    <PushPermissionPrompt v-if="session.user" />
    <PwaInstallPrompt :show-card="Boolean(session.user)" />
  </main>
</template>
