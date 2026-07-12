<script setup lang="ts">
import type { PaymentOrderLog, ReferralSummary, UserRecurrentSubscription } from "@club/shared";
import {
  BarChart3,
  Camera,
  Check,
  Copy,
  Crop,
  Fingerprint,
  Gift,
  LogOut,
  Minus,
  Moon,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Sun
} from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { activateReferralRewards, getLearningHome, getPaymentHistory, getPaymentPlans, getReferralProfile } from "@/api/client";
import { useI18n, type Locale } from "@/features/app/i18n";
import NotificationCenter from "@/features/app/NotificationCenter.vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { findActiveRecurrentSubscription, findRestorableRecurrentSubscription } from "@/features/billing/recurrentSubscription";
import {
  applyAvatarGesture,
  clampAvatarPosition,
  clampAvatarScale,
  getAvatarGestureMetrics,
  type AvatarGestureMetrics
} from "@/features/profile/avatarGesture";
import {
  canUseReferralActivation,
  getProfileMembershipStatusText,
  getProfileMembershipStatusTone,
  getProfilePaymentActionText,
  getReferralRewardText
} from "@/features/profile/profileSubscriptionCopy";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type DesignTheme, type Theme } from "@/stores/ui";

defineEmits<{
  openPayments: [];
}>();

const session = useSessionStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { currentLocale, setLocale, t } = useI18n();

function openProfileTask(path: string) {
  if (route.path !== path) {
    void router.push(path);
  }
}

function closeProfileTask() {
  avatarEditorOpen.value = false;
  if (route.path !== "/profile") {
    void router.push("/profile");
  }
}

const isMember = computed(() => session.user?.membershipStatus === "active");
const totalItems = ref(0);
const completedItems = ref(0);
const lastOpenedTitle = ref<string | null>(null);
const paymentOrders = ref<PaymentOrderLog[]>([]);
const recurrentSubscriptions = ref<UserRecurrentSubscription[]>([]);
const referral = ref<ReferralSummary | null>(null);
const referralRewardDays = ref(7);
const referralSaving = ref(false);
const referralCopied = ref(false);
const referralMessage = ref<string | null>(null);
const avatarSaving = ref(false);
const avatarMessage = ref<string | null>(null);
const avatarEditorOpen = ref(false);
const avatarDisplaySaving = ref(false);
const avatarDraftX = ref(50);
const avatarDraftY = ref(50);
const avatarDraftScale = ref(1);
const avatarGestureActive = ref(false);
const emailVisible = ref(false);
const logoutSaving = ref(false);
const logoutMessage = ref<string | null>(null);
const showLogoutConfirm = ref(false);
const displayNameEditorOpen = ref(false);
const displayNameDraft = ref("");
const displayNameSaving = ref(false);
const displayNameError = ref<string | null>(null);
const avatarMaxSizeBytes = 5 * 1024 * 1024;
const avatarAllowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const avatarAllowedExtension = /\.(jpe?g|png|webp)$/i;
const accessUntil = computed(() =>
  session.user?.membershipExpiresAt ? new Date(session.user.membershipExpiresAt).toLocaleDateString() : t("notActive")
);
const displayName = computed(() => session.user?.displayName || session.user?.firstName || session.user?.username || t("profileDefaultName"));
const accountEmail = computed(() => session.user?.email || session.user?.username || session.user?.telegramId || "");
const avatarInitial = computed(() => displayName.value.slice(0, 1).toUpperCase());
const avatarDisplayStyle = computed(() => {
  const positionX = session.user?.avatarPositionX ?? 50;
  const positionY = session.user?.avatarPositionY ?? 50;
  const scale = session.user?.avatarScale ?? 1;

  return {
    objectPosition: `${positionX}% ${positionY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${positionX}% ${positionY}%`
  };
});
const avatarDraftStyle = computed(() => ({
  objectPosition: `${avatarDraftX.value}% ${avatarDraftY.value}%`,
  transform: `scale(${avatarDraftScale.value})`,
  transformOrigin: `${avatarDraftX.value}% ${avatarDraftY.value}%`
}));

function openDisplayNameEditor() {
  if (session.user?.displayNameChangedByUserAt) return;
  displayNameDraft.value = displayName.value;
  displayNameError.value = null;
  displayNameEditorOpen.value = true;
}

async function saveDisplayName() {
  displayNameSaving.value = true;
  displayNameError.value = null;
  try {
    await session.updateDisplayName(displayNameDraft.value);
    displayNameEditorOpen.value = false;
  } catch (error) {
    const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode;
    displayNameError.value = status === 409
      ? "Этот ник уже занят."
      : status === 403
        ? "Самостоятельная смена уже использована."
        : "Используйте 3–20 букв, цифр, _ или -.";
  } finally {
    displayNameSaving.value = false;
  }
}
const daysLeft = computed(() => {
  if (!session.user?.membershipExpiresAt || !isMember.value) {
    return 0;
  }

  const diff = new Date(session.user.membershipExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
});
const roleLabel = computed(() => {
  if (session.user?.role === "owner") {
    return t("ownerRole");
  }

  if (session.user?.role === "admin") {
    return t("adminRole");
  }

  return t("memberRole");
});
const subscriptionProgress = computed(() => {
  if (!isMember.value) {
    return 10;
  }

  return Math.max(8, Math.min(100, Math.round((daysLeft.value / 30) * 100)));
});
const subscriptionMeta = computed(() => {
  if (!isMember.value) {
    return t("profilePaymentWaiting");
  }

  if (daysLeft.value === 0) {
    return t("profileAccessEndsToday");
  }

  return `${daysLeft.value} ${t("profileDaysLeft")}`;
});
const paymentStatusText = computed(() => {
  if (!isMember.value) {
    return t("homeInactive");
  }

  if (session.user?.paymentType === "recurrent") {
    return session.user.recurrentPaymentStatus === "cancelled" ? t("profileRecurrentCancelled") : t("profileRecurrentPayment");
  }

  if (session.user?.paymentType === "one_time") {
    return t("profileOneTimePayment");
  }

  if (session.user?.paymentType === "manual") {
    return t("profileManualAccess");
  }

  return t("profileAccessActive");
});
const paymentDateText = computed(() => {
  if (!isMember.value) {
    return null;
  }

  if (session.user?.paymentType === "recurrent" && session.user.recurrentPaymentStatus === "active" && session.user.nextPaymentAt) {
    return `${t("profileNextPayment")} ${new Date(session.user.nextPaymentAt).toLocaleDateString(currentLocale.value === "ru" ? "ru-RU" : "en-US")}`;
  }

  if (session.user?.paymentType === "recurrent" && session.user.recurrentPaymentStatus === "cancelled" && session.user.membershipExpiresAt) {
    return `${t("profileWorksUntil")} ${new Date(session.user.membershipExpiresAt).toLocaleDateString(currentLocale.value === "ru" ? "ru-RU" : "en-US")}`;
  }

  if (session.user?.paymentType === "one_time" && session.user.membershipExpiresAt) {
    return `${t("profileWorksUntil")} ${new Date(session.user.membershipExpiresAt).toLocaleDateString(currentLocale.value === "ru" ? "ru-RU" : "en-US")}`;
  }

  return null;
});
const activeRecurrentSubscription = computed(() => findActiveRecurrentSubscription(recurrentSubscriptions.value));
const restorableRecurrentSubscription = computed(() =>
  findRestorableRecurrentSubscription(recurrentSubscriptions.value, {
    paymentType: session.user?.paymentType ?? null,
    recurrentPaymentStatus: session.user?.recurrentPaymentStatus ?? null,
    membershipExpiresAt: session.user?.membershipExpiresAt ?? null
  })
);
const manageableRecurrentSubscription = computed(() => activeRecurrentSubscription.value ?? restorableRecurrentSubscription.value);
const paymentActionText = computed(() => {
  return getProfilePaymentActionText({
    hasManageableRecurrentSubscription: Boolean(manageableRecurrentSubscription.value),
    isMember: isMember.value,
    extendText: t("homeExtend"),
    joinText: t("joinClub")
  });
});
const profileSubscriptionStatusText = computed(() =>
  getProfileMembershipStatusText({
    isMember: isMember.value,
    activeText: t("profileSubscriptionActive"),
    inactiveText: t("profileSubscriptionInactive")
  })
);
const profileSubscriptionStatusClass = computed(() => getProfileMembershipStatusTone({ isMember: isMember.value }));
const referralRewardText = computed(() =>
  getReferralRewardText({
    rewardDays: referralRewardDays.value,
    prefix: t("referralRewardPrefix"),
    daysUnit: t("profileDaysShort"),
    suffix: t("referralRewardSuffix")
  })
);
const canActivateReferral = computed(() =>
  Boolean(
    referral.value &&
      canUseReferralActivation({
        isSaving: referralSaving.value,
        canActivate: referral.value.canActivate,
        availableDays: referral.value.availableDays,
        paymentType: session.user?.paymentType,
        recurrentPaymentStatus: session.user?.recurrentPaymentStatus
      })
  )
);
const learningProgress = computed(() => {
  if (!totalItems.value) {
    return 0;
  }

  return Math.round((completedItems.value / totalItems.value) * 100);
});
const isStatsEmpty = computed(() => completedItems.value === 0 && !lastOpenedTitle.value);
const themeOptions = computed<Array<{ value: Theme; label: string; icon: typeof Moon }>>(() => [
  { value: "dark", label: t("profileThemeNight"), icon: Moon },
  { value: "light", label: t("profileThemeDay"), icon: Sun }
]);
const designThemeOptions = computed<
  Array<{ value: DesignTheme; label: string; description: string; previewClass: string }>
>(() => [
  {
    value: "dark-soft-touch",
    label: t("profileDesignThemeSoftTouch"),
    description: t("profileDesignThemeSoftTouchText"),
    previewClass: "design-theme-preview-soft-touch"
  },
  {
    value: "graphite-electric-blue",
    label: t("profileDesignThemeGraphite"),
    description: t("profileDesignThemeGraphiteText"),
    previewClass: "design-theme-preview-graphite"
  }
]);
const visualScaleMin = 0.8;
const visualScaleMax = 1.4;
const visualScaleStep = 0.1;
const visualScaleDisplayValue = computed(() => ui.visualScale.toFixed(1));
const avatarGesturePointers = new Map<number, AvatarGesturePointState>();
let avatarGestureSession: AvatarGestureSession | null = null;

type AvatarGesturePointState = {
  clientX: number;
  clientY: number;
};

type AvatarGestureSession = {
  startPositionX: number;
  startPositionY: number;
  startScale: number;
  startMetrics: AvatarGestureMetrics;
  previewWidth: number;
  previewHeight: number;
};

function changeLocale(locale: Locale) {
  setLocale(locale);
}

function handleVisualScaleRange(event: Event) {
  ui.setVisualScale((event.target as HTMLInputElement).value);
}

function nudgeVisualScale(delta: number) {
  ui.setVisualScale(ui.visualScale + delta);
}

function paymentOrderStatusLabel(status: PaymentOrderLog["status"]) {
  if (status === "paid") {
    return t("paymentStatusPaid");
  }

  if (status === "failed") {
    return t("paymentStatusFailed");
  }

  if (status === "cancelled") {
    return t("paymentStatusCancelled");
  }

  return t("paymentStatusPending");
}

function paymentOrderDate(order: PaymentOrderLog) {
  return new Date(order.paidAt ?? order.createdAt).toLocaleString(currentLocale.value === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isAvatarFileAllowed(file: File) {
  return file.size > 0 && file.size <= avatarMaxSizeBytes && (avatarAllowedTypes.has(file.type) || avatarAllowedExtension.test(file.name));
}

function startAvatarGestureSession(target: HTMLElement) {
  const metrics = getAvatarGestureMetrics([...avatarGesturePointers.values()]);
  if (!metrics) {
    avatarGestureSession = null;
    avatarGestureActive.value = false;
    return;
  }

  const rect = target.getBoundingClientRect();
  avatarGestureSession = {
    startPositionX: avatarDraftX.value,
    startPositionY: avatarDraftY.value,
    startScale: avatarDraftScale.value,
    startMetrics: metrics,
    previewWidth: rect.width,
    previewHeight: rect.height
  };
  avatarGestureActive.value = true;
}

function applyCurrentAvatarGesture() {
  if (!avatarGestureSession) {
    return;
  }

  const metrics = getAvatarGestureMetrics([...avatarGesturePointers.values()]);
  if (!metrics) {
    return;
  }

  const next = applyAvatarGesture({
    startPositionX: avatarGestureSession.startPositionX,
    startPositionY: avatarGestureSession.startPositionY,
    startScale: avatarGestureSession.startScale,
    startCenterX: avatarGestureSession.startMetrics.centerX,
    startCenterY: avatarGestureSession.startMetrics.centerY,
    currentCenterX: metrics.centerX,
    currentCenterY: metrics.centerY,
    startDistance: avatarGestureSession.startMetrics.distance,
    currentDistance: metrics.distance,
    previewWidth: avatarGestureSession.previewWidth,
    previewHeight: avatarGestureSession.previewHeight
  });

  avatarDraftX.value = next.positionX;
  avatarDraftY.value = next.positionY;
  avatarDraftScale.value = next.scale;
}

function handleAvatarGestureStart(event: PointerEvent) {
  if (!session.user?.photoUrl) {
    return;
  }

  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  try {
    target.setPointerCapture?.(event.pointerId);
  } catch {
    // Some browser shells reject capture for synthetic or already-captured pointers.
  }
  avatarGesturePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  startAvatarGestureSession(target);
}

function handleAvatarGestureMove(event: PointerEvent) {
  if (!avatarGesturePointers.has(event.pointerId)) {
    return;
  }

  event.preventDefault();
  avatarGesturePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  applyCurrentAvatarGesture();
}

function handleAvatarGestureEnd(event: PointerEvent) {
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  try {
    target.releasePointerCapture?.(event.pointerId);
  } catch {
    // The browser may already release capture before lostpointercapture fires.
  }
  avatarGesturePointers.delete(event.pointerId);
  if (!avatarGesturePointers.size) {
    avatarGestureSession = null;
    avatarGestureActive.value = false;
    return;
  }

  startAvatarGestureSession(target);
}

function handleAvatarWheel(event: WheelEvent) {
  if (!session.user?.photoUrl) {
    return;
  }

  avatarDraftScale.value = clampAvatarScale(avatarDraftScale.value + (event.deltaY < 0 ? 0.08 : -0.08));
}

function openAvatarEditor(options: { useCurrentAvatar?: boolean } = {}) {
  if (!session.user?.photoUrl) {
    avatarMessage.value = t("profileAvatarUploadFirst");
    return;
  }

  avatarGesturePointers.clear();
  avatarGestureSession = null;
  avatarGestureActive.value = false;
  avatarDraftX.value = options.useCurrentAvatar ? 50 : (session.user.avatarPositionX ?? 50);
  avatarDraftY.value = options.useCurrentAvatar ? 50 : (session.user.avatarPositionY ?? 50);
  avatarDraftScale.value = options.useCurrentAvatar ? 1 : (session.user.avatarScale ?? 1);
  avatarMessage.value = null;
  avatarEditorOpen.value = true;
  openProfileTask("/profile/avatar");
}

function zoomAvatar(amount: number) {
  avatarDraftScale.value = clampAvatarScale(avatarDraftScale.value + amount);
}

function resetAvatarDraft() {
  avatarDraftX.value = 50;
  avatarDraftY.value = 50;
  avatarDraftScale.value = 1;
}

async function handleAvatarDisplaySave() {
  avatarDisplaySaving.value = true;
  avatarMessage.value = null;
  try {
    await session.updateAvatarDisplay({
      avatarPositionX: avatarDraftX.value,
      avatarPositionY: avatarDraftY.value,
      avatarScale: avatarDraftScale.value
    });
    avatarEditorOpen.value = false;
    closeProfileTask();
    avatarMessage.value = t("profileAvatarDisplaySaved");
  } catch {
    avatarMessage.value = t("profileAvatarDisplayError");
  } finally {
    avatarDisplaySaving.value = false;
  }
}

async function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  if (!isAvatarFileAllowed(file)) {
    avatarMessage.value = t("profileAvatarInvalid");
    input.value = "";
    return;
  }

  avatarSaving.value = true;
  avatarMessage.value = null;
  try {
    await session.uploadAvatar(file);
    openAvatarEditor({ useCurrentAvatar: true });
  } catch {
    avatarMessage.value = t("profileAvatarError");
  } finally {
    avatarSaving.value = false;
    input.value = "";
  }
}

async function handleLogout() {
  logoutSaving.value = true;
  logoutMessage.value = null;
  try {
    await session.logout();
  } catch {
    logoutMessage.value = t("profileLogoutError");
  } finally {
    logoutSaving.value = false;
  }
}

async function confirmLogout() {
  showLogoutConfirm.value = false;
  await handleLogout();
}

async function copyReferralLink() {
  if (!referral.value?.link) {
    return;
  }

  await navigator.clipboard.writeText(referral.value.link).catch(() => null);
  referralCopied.value = true;
  referralMessage.value = t("referralCopied");
  window.setTimeout(() => {
    referralCopied.value = false;
  }, 1800);
}

function referralBlockReason() {
  if (!referral.value?.activationBlockedReason) {
    if (session.user?.paymentType === "recurrent" && session.user.recurrentPaymentStatus === "active") {
      return t("referralBlockedRecurrent");
    }

    return null;
  }

  if (referral.value.activationBlockedReason === "active_recurrent_payment") {
    return t("referralBlockedRecurrent");
  }

  if (referral.value.activationBlockedReason === "no_available_days") {
    return t("referralNoDays");
  }

  return t("referralCannotActivate");
}

async function handleReferralActivation() {
  referralSaving.value = true;
  referralMessage.value = null;
  try {
    const response = await activateReferralRewards();
    referral.value = response.referral;
    referralMessage.value =
      response.activatedDays > 0
        ? `${t("referralActivated")} ${response.activatedDays} ${t("profileDaysShort")}`
        : t("referralNoDays");
    await session.load({ silent: true });
  } catch {
    referralMessage.value = referralBlockReason() ?? t("referralActivationError");
  } finally {
    referralSaving.value = false;
  }
}

onMounted(async () => {
  const [learningResult, paymentsResult, plansResult, referralResult] = await Promise.allSettled([
    getLearningHome(),
    getPaymentHistory(),
    getPaymentPlans(),
    getReferralProfile()
  ]);

  if (learningResult.status === "fulfilled") {
    totalItems.value = learningResult.value.progress.totalItems;
    completedItems.value = learningResult.value.progress.completedItems;
    lastOpenedTitle.value = learningResult.value.progress.lastOpenedItem?.title ?? null;
  } else {
    totalItems.value = 0;
    completedItems.value = 0;
    lastOpenedTitle.value = null;
  }

  paymentOrders.value = paymentsResult.status === "fulfilled" ? paymentsResult.value.orders : [];
  recurrentSubscriptions.value = plansResult.status === "fulfilled" ? plansResult.value.recurrentSubscriptions : [];
  if (referralResult.status === "fulfilled") {
    referral.value = referralResult.value.referral;
    referralRewardDays.value = referralResult.value.settings.referralRewardDays;
  } else {
    referral.value = null;
  }

  if (route.path === "/profile/avatar" && session.user?.photoUrl) {
    openAvatarEditor();
  } else if (route.path === "/profile/avatar") {
    closeProfileTask();
  }
});

watch(
  () => route.path,
  (path) => {
    if (path === "/profile/avatar" && session.user?.photoUrl && !avatarEditorOpen.value) {
      openAvatarEditor();
    } else if (path !== "/profile/avatar") {
      avatarEditorOpen.value = false;
    }
  }
);
</script>

<template>
  <section class="soft-home ui-page-section space-y-4">
    <div class="section-head ui-page-header">
      <div>
        <h2 class="section-title">Профиль</h2>
        <p class="section-subtitle">Доступ, статистика и настройки аккаунта.</p>
      </div>
      <div class="compact-controls shrink-0">
        <button
          class="ui-icon-button"
          type="button"
          :aria-label="t('language')"
          @click="changeLocale(currentLocale === 'ru' ? 'en' : 'ru')"
        >
          {{ currentLocale.toUpperCase() }}
        </button>
        <NotificationCenter />
      </div>
    </div>

    <div class="profile-overview-stack">
      <section class="soft-card ui-card profile-identity-card-v2">
        <div class="profile-avatar-stack profile-avatar-stack-v2">
          <div class="profile-avatar profile-avatar-large">
            <img v-if="session.user?.photoUrl" :src="session.user.photoUrl" :alt="displayName" :style="avatarDisplayStyle" />
            <span v-else>{{ avatarInitial }}</span>
          </div>
          <div class="profile-avatar-actions">
            <label
              class="profile-avatar-icon-button ui-icon-button"
              :class="{ 'profile-avatar-upload-disabled': avatarSaving }"
              :aria-label="avatarSaving ? t('profileAvatarUploading') : t('profileAvatarUpload')"
              :title="avatarSaving ? t('profileAvatarUploading') : t('profileAvatarUpload')"
            >
              <Camera class="h-4 w-4" aria-hidden="true" />
              <input
                class="profile-upload-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                :disabled="avatarSaving"
                @change="handleAvatarUpload"
              />
            </label>
            <button
              class="profile-avatar-icon-button ui-icon-button"
              type="button"
              :disabled="!session.user?.photoUrl || avatarSaving"
              :aria-label="t('profileAvatarAdjust')"
              :title="t('profileAvatarAdjust')"
              @click="openAvatarEditor()"
            >
              <Crop class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="profile-identity-copy-v2">
          <div class="profile-display-name-row">
            <h3>{{ displayName }}</h3>
            <button v-if="!session.user?.displayNameChangedByUserAt" class="profile-name-edit" type="button" aria-label="Изменить ник" @click="openDisplayNameEditor">
              <Pencil class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div class="profile-identity-badges-v2">
            <span class="profile-role-pill">{{ roleLabel }}</span>
            <p
              class="profile-access-current-status payment-provider-status"
              :class="[profileSubscriptionStatusClass, isMember ? 'payment-provider-status-enabled' : 'payment-provider-status-disabled']"
            >{{ profileSubscriptionStatusText }}</p>
          </div>
          <small v-if="session.user?.displayNameChangedByUserAt" class="profile-name-locked">Изменение через администратора</small>
        </div>
      </section>

      <section class="soft-card ui-card profile-details-card-v2">
        <button class="profile-detail-row-v2" type="button" :aria-label="emailVisible ? t('profileEmailVisible') : t('profileEmailShow')" @click="emailVisible = true">
          <Fingerprint class="h-5 w-5" aria-hidden="true" />
          <span>Email</span>
          <strong :class="{ 'profile-secret-blurred': !emailVisible }">{{ accountEmail }}</strong>
        </button>
        <div class="profile-detail-row-v2">
          <div class="profile-detail-icon-v2"><Check class="h-5 w-5" aria-hidden="true" /></div>
          <span>{{ paymentStatusText }}</span>
          <strong v-if="isMember">до {{ accessUntil }}</strong>
        </div>
        <div class="profile-progress-row-v2">
          <div class="subscription-bar"><span :style="{ width: `${subscriptionProgress}%` }"></span></div>
          <strong>{{ subscriptionMeta }}</strong>
        </div>
      </section>

      <div class="profile-actions-v2">
        <button class="soft-inline-button ui-button" type="button" @click="$emit('openPayments')">{{ paymentActionText }}</button>
        <button class="secondary-button ui-button profile-logout-button" type="button" :disabled="logoutSaving" @click="showLogoutConfirm = true">
          <LogOut class="h-4 w-4" aria-hidden="true" />
          <span>{{ logoutSaving ? t("profileLogoutLoading") : t("profileLogout") }}</span>
        </button>
      </div>
      <p v-if="avatarMessage" class="profile-avatar-help">{{ avatarMessage }}</p>
      <p v-if="logoutMessage" class="profile-empty-text">{{ logoutMessage }}</p>
    </div>

    <div v-if="displayNameEditorOpen" class="profile-name-sheet-backdrop" @click.self="displayNameEditorOpen = false">
      <form class="profile-name-sheet" @submit.prevent="saveDisplayName">
        <div class="profile-name-sheet-head"><h3>Изменить ник</h3><button type="button" aria-label="Закрыть" @click="displayNameEditorOpen = false">×</button></div>
        <label for="profile-display-name">Новый ник</label>
        <input id="profile-display-name" v-model.trim="displayNameDraft" class="text-input" maxlength="20" autocomplete="nickname" />
        <p class="profile-name-hint">От 3 до 20 символов: буквы, цифры, _ и -. Изменить самостоятельно можно один раз.</p>
        <p v-if="displayNameError" class="profile-name-error">{{ displayNameError }}</p>
        <div class="profile-name-sheet-actions">
          <button class="secondary-button ui-button" type="button" @click="displayNameEditorOpen = false">Отмена</button>
          <button class="soft-inline-button ui-button" type="submit" :disabled="displayNameSaving">{{ displayNameSaving ? "Сохранение…" : "Сохранить" }}</button>
        </div>
      </form>
    </div>

    <section class="space-y-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("yourStats") }}</h3>
        <span class="soft-link">{{ learningProgress }}%</span>
      </div>

      <div class="grid gap-2">
        <article v-if="isStatsEmpty" class="soft-list-card">
          <div class="soft-code">
            <BarChart3 class="h-4 w-4" aria-hidden="true" />
          </div>
          <div class="min-w-0 flex-1">
            <h4>{{ t("statsEmptyTitle") }}</h4>
            <p>{{ t("statsEmptyText") }}</p>
          </div>
        </article>

        <article v-else class="soft-list-card">
          <div class="soft-code">{{ completedItems }}</div>
          <div class="min-w-0 flex-1">
            <h4>{{ t("learningProgress") }}</h4>
            <p>{{ completedItems }} / {{ totalItems }} · {{ lastOpenedTitle || t("lastOpenedEmpty") }}</p>
          </div>
        </article>
      </div>
    </section>

    <section class="soft-card ui-card profile-referral-card">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="soft-section-title">{{ t("referralTitle") }}</h3>
          <p class="profile-empty-text">{{ t("referralSubtitle") }}</p>
          <p class="profile-referral-reward">{{ referralRewardText }}</p>
        </div>
        <Gift class="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
      </div>

      <div v-if="referral" class="profile-referral-body mt-3">
        <div class="profile-referral-link">
          <span>{{ referral.link }}</span>
          <button class="ui-icon-button" type="button" :aria-label="t('referralCopy')" @click="copyReferralLink">
            <Check v-if="referralCopied" class="h-4 w-4" aria-hidden="true" />
            <Copy v-else class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div class="profile-referral-stats">
          <article>
            <span>{{ t("referralInvited") }}</span>
            <strong>{{ referral.invitedCount }}</strong>
          </article>
          <article>
            <span>{{ t("referralPaid") }}</span>
            <strong>{{ referral.paidCount }}</strong>
          </article>
          <article>
            <span>{{ t("referralAvailable") }}</span>
            <strong>{{ referral.availableDays }}</strong>
          </article>
        </div>

        <button
          class="soft-inline-button ui-button"
          type="button"
          :disabled="!canActivateReferral"
          @click="handleReferralActivation"
        >
          {{ referralSaving ? t("referralActivating") : t("referralActivate") }}
        </button>
        <p class="profile-empty-text">{{ referralMessage || referralBlockReason() || t("referralHint") }}</p>
      </div>

      <p v-else class="profile-empty-text mt-3">{{ t("referralLoading") }}</p>
    </section>

    <section class="soft-card ui-card">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("profilePaymentHistory") }}</h3>
        <button class="soft-link ui-button ui-button--ghost" type="button" @click="$emit('openPayments')">{{ t("payment") }}</button>
      </div>
      <div class="payment-log-list mt-3">
        <article v-for="order in paymentOrders.slice(0, 5)" :key="order.id" class="payment-log-card">
          <div>
            <strong>{{ order.productTitle }}</strong>
            <span>{{ paymentOrderDate(order) }} · {{ order.amountRub.toLocaleString("ru-RU") }} ₽</span>
          </div>
          <em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em>
        </article>
        <p v-if="!paymentOrders.length" class="profile-empty-text">{{ t("profileNoPayments") }}</p>
      </div>
    </section>

    <section class="soft-card ui-card profile-settings">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("profileAppearance") }}</h3>
        <Palette class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </div>

      <div class="appearance-setting-group mt-3">
        <span class="appearance-setting-label">{{ t("profileAppearanceMode") }}</span>
        <div class="theme-choice-row">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-choice ui-button"
          :class="{ 'theme-choice-active': ui.theme === option.value }"
          type="button"
          @click="ui.setTheme(option.value)"
        >
          <component :is="option.icon" class="h-4 w-4" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </button>
        </div>
      </div>

      <div class="appearance-setting-group mt-3">
        <span class="appearance-setting-label">{{ t("profileAppearanceThemes") }}</span>
        <div class="design-theme-choice-grid">
          <button
            v-for="option in designThemeOptions"
            :key="option.value"
            class="design-theme-choice ui-button"
            :class="{ 'design-theme-choice-active': ui.designTheme === option.value }"
            type="button"
            :aria-pressed="ui.designTheme === option.value"
            @click="ui.setDesignTheme(option.value)"
          >
            <span class="design-theme-preview" :class="option.previewClass" aria-hidden="true">
              <i></i><i></i><i></i><i></i>
            </span>
            <span class="design-theme-copy">
              <strong>{{ option.label }}</strong>
              <small>{{ option.description }}</small>
            </span>
            <span class="design-theme-check" aria-hidden="true">
              <Check v-if="ui.designTheme === option.value" class="h-4 w-4" />
            </span>
          </button>
        </div>
      </div>

      <div class="visual-scale-control mt-3">
        <div class="visual-scale-control-head">
          <span>{{ t("profileVisualScaleControl") }}</span>
          <strong>{{ visualScaleDisplayValue }}</strong>
        </div>
        <div class="visual-scale-slider-row">
          <button
            class="visual-scale-step-button ui-icon-button"
            type="button"
            :aria-label="t('profileVisualScaleDecrease')"
            :disabled="ui.visualScale <= visualScaleMin"
            @click="nudgeVisualScale(-visualScaleStep)"
          >
            <Minus class="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            class="visual-scale-range"
            type="range"
            min="0.8"
            max="1.4"
            step="0.1"
            :value="ui.visualScale"
            :aria-label="t('profileVisualScaleControl')"
            @input="handleVisualScaleRange"
          />
          <button
            class="visual-scale-step-button ui-icon-button"
            type="button"
            :aria-label="t('profileVisualScaleIncrease')"
            :disabled="ui.visualScale >= visualScaleMax"
            @click="nudgeVisualScale(visualScaleStep)"
          >
            <Plus class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

    </section>

    <TaskScreen
      v-if="avatarEditorOpen"
      class="profile-avatar-task-screen"
      :title="t('profileAvatarEditorTitle')"
      :subtitle="t('profileAvatarEditorText')"
      portal
      @back="closeProfileTask"
    >
      <section class="profile-avatar-editor-modal ui-card">
        <div class="profile-avatar-editor-workspace">
          <div
            class="profile-avatar-gesture-stage"
            :class="{ 'profile-avatar-gesture-stage-active': avatarGestureActive }"
            role="application"
            :aria-label="t('profileAvatarGestureLabel')"
            @pointerdown="handleAvatarGestureStart"
            @pointermove="handleAvatarGestureMove"
            @pointerup="handleAvatarGestureEnd"
            @pointercancel="handleAvatarGestureEnd"
            @lostpointercapture="handleAvatarGestureEnd"
            @wheel.prevent="handleAvatarWheel"
          >
            <div class="profile-avatar-crop-preview" aria-live="polite">
              <img v-if="session.user?.photoUrl" :src="session.user.photoUrl" :alt="displayName" :style="avatarDraftStyle" draggable="false" />
              <span v-else>{{ avatarInitial }}</span>
            </div>
            <p>{{ t("profileAvatarGestureHint") }}</p>
          </div>

          <div class="profile-avatar-editor-controls">
            <button class="ui-icon-button" type="button" :aria-label="t('profileAvatarZoomOut')" @click="zoomAvatar(-0.1)">
              <Minus class="h-4 w-4" aria-hidden="true" />
            </button>
            <strong>{{ Math.round(avatarDraftScale * 100) }}%</strong>
            <button class="ui-icon-button" type="button" :aria-label="t('profileAvatarZoomIn')" @click="zoomAvatar(0.1)">
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
            <button class="profile-avatar-center-button ui-button" type="button" :aria-label="t('profileAvatarCenter')" @click="resetAvatarDraft">
              <RotateCcw class="h-4 w-4" aria-hidden="true" />
              <span>{{ t("profileAvatarCenterShort") }}</span>
            </button>
          </div>
        </div>

        <div class="profile-modal-actions">
          <button class="secondary-button ui-button" type="button" @click="closeProfileTask">{{ t("cancel") }}</button>
          <button class="soft-inline-button ui-button" type="button" :disabled="avatarDisplaySaving" @click="handleAvatarDisplaySave">
            {{ avatarDisplaySaving ? t("saving") : t("save") }}
          </button>
        </div>
      </section>
    </TaskScreen>

    <div v-if="showLogoutConfirm" class="profile-modal-backdrop" @click.self="showLogoutConfirm = false">
      <section class="profile-logout-confirm ui-card" role="dialog" aria-modal="true" :aria-label="t('profileLogoutConfirmTitle')">
        <div class="profile-modal-head">
          <div>
            <h3>{{ t("profileLogoutConfirmTitle") }}</h3>
            <p>{{ t("profileLogoutConfirmText") }}</p>
          </div>
        </div>
        <div class="profile-modal-actions">
          <button class="secondary-button ui-button" type="button" @click="showLogoutConfirm = false">{{ t("profileLogoutCancel") }}</button>
          <button class="secondary-button ui-button profile-logout-button" type="button" :disabled="logoutSaving" @click="confirmLogout">
            <LogOut class="h-4 w-4" aria-hidden="true" />
            <span>{{ logoutSaving ? t("profileLogoutLoading") : t("profileLogoutConfirmAction") }}</span>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
