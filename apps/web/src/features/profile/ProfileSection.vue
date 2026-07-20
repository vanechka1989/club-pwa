<script setup lang="ts">
import type { PaymentOrderLog, ReferralSummary, UserRecurrentSubscription } from "@club/shared";
import {
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { activateReferralRewards, getLearningHome, getPaymentHistory, getPaymentPlans, getReferralProfile } from "@/api/client";
import { useI18n, type Locale } from "@/features/app/i18n";
import NotificationCenter from "@/features/app/NotificationCenter.vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { UiPageHeader } from "@/features/ui";
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
import { getLatestPaidOrder } from "@/features/profile/profilePayments";
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
  discardAvatarDraftFile();
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
const avatarPhotoMenuOpen = ref(false);
const avatarDisplaySaving = ref(false);
const avatarDraftFile = ref<File | null>(null);
const avatarDraftUrl = ref<string | null>(null);
const avatarDraftX = ref(50);
const avatarDraftY = ref(50);
const avatarDraftScale = ref(1);
const avatarGestureActive = ref(false);
const emailVisible = ref(false);
const logoutSaving = ref(false);
const logoutMessage = ref<string | null>(null);
const showLogoutConfirm = ref(false);
const activeProfilePanel = ref<"referrals" | "appearance" | null>(null);
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
const avatarEditorPreviewUrl = computed(() => avatarDraftUrl.value ?? session.user?.photoUrl ?? null);

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
  },
  {
    value: "pine-teal",
    label: t("profileDesignThemePine"),
    description: t("profileDesignThemePineText"),
    previewClass: "design-theme-preview-pine"
  },
  {
    value: "warm-clay",
    label: t("profileDesignThemeClay"),
    description: t("profileDesignThemeClayText"),
    previewClass: "design-theme-preview-clay"
  },
  {
    value: "plum-rose",
    label: t("profileDesignThemePlum"),
    description: t("profileDesignThemePlumText"),
    previewClass: "design-theme-preview-plum"
  }
]);
const visualScaleMin = 0.8;
const visualScaleMax = 1.4;
const visualScaleStep = 0.1;
const visualScaleDisplayValue = computed(() => ui.visualScale.toFixed(1));
const currentDesignThemeLabel = computed(
  () => designThemeOptions.value.find((option) => option.value === ui.designTheme)?.label ?? ""
);
const currentThemeLabel = computed(
  () => themeOptions.value.find((option) => option.value === ui.theme)?.label ?? ""
);
const latestPayment = computed(() => getLatestPaidOrder(paymentOrders.value));
const latestPaymentAmount = computed(() =>
  latestPayment.value ? `${latestPayment.value.amountRub.toLocaleString("ru-RU")} ₽` : "—"
);
const latestPaymentDate = computed(() =>
  latestPayment.value
    ? new Date(latestPayment.value.paidAt ?? latestPayment.value.createdAt).toLocaleDateString(
        currentLocale.value === "ru" ? "ru-RU" : "en-US",
        { day: "numeric", month: "long" }
      )
    : t("profileNoPayments")
);
const referralSummaryText = computed(() =>
  referral.value
    ? `${referral.value.invitedCount} / ${referral.value.paidCount} / ${referral.value.availableDays}`
    : "— / — / —"
);

function openProfilePanel(panel: "referrals" | "appearance") {
  activeProfilePanel.value = panel;
}

function closeProfilePanel() {
  activeProfilePanel.value = null;
}
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
  if (!avatarEditorPreviewUrl.value) {
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
  if (!avatarEditorPreviewUrl.value) {
    return;
  }

  avatarDraftScale.value = clampAvatarScale(avatarDraftScale.value + (event.deltaY < 0 ? 0.08 : -0.08));
}

function openAvatarPhotoActions() {
  if (avatarSaving.value) {
    return;
  }

  avatarPhotoMenuOpen.value = true;
}

function openAvatarEditor(options: { useCurrentAvatar?: boolean } = {}) {
  if (!avatarEditorPreviewUrl.value) {
    avatarMessage.value = t("profileAvatarUploadFirst");
    return;
  }

  avatarGesturePointers.clear();
  avatarGestureSession = null;
  avatarGestureActive.value = false;
  avatarDraftX.value = options.useCurrentAvatar ? 50 : (session.user?.avatarPositionX ?? 50);
  avatarDraftY.value = options.useCurrentAvatar ? 50 : (session.user?.avatarPositionY ?? 50);
  avatarDraftScale.value = options.useCurrentAvatar ? 1 : (session.user?.avatarScale ?? 1);
  avatarMessage.value = null;
  avatarEditorOpen.value = true;
  openProfileTask("/profile/avatar");
}

function discardAvatarDraftFile() {
  if (avatarDraftUrl.value) {
    URL.revokeObjectURL(avatarDraftUrl.value);
  }
  avatarDraftFile.value = null;
  avatarDraftUrl.value = null;
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
  avatarSaving.value = Boolean(avatarDraftFile.value);
  avatarMessage.value = null;
  const display = {
    avatarPositionX: avatarDraftX.value,
    avatarPositionY: avatarDraftY.value,
    avatarScale: avatarDraftScale.value
  };
  try {
    if (avatarDraftFile.value) {
      await session.uploadAvatar(avatarDraftFile.value, display);
    } else {
      await session.updateAvatarDisplay(display);
    }
    closeProfileTask();
    avatarMessage.value = t("profileAvatarDisplaySaved");
  } catch {
    avatarMessage.value = avatarDraftFile.value ? t("profileAvatarError") : t("profileAvatarDisplayError");
  } finally {
    avatarDisplaySaving.value = false;
    avatarSaving.value = false;
  }
}

function handleAvatarUpload(event: Event) {
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

  discardAvatarDraftFile();
  avatarDraftFile.value = file;
  avatarDraftUrl.value = URL.createObjectURL(file);
  avatarMessage.value = null;
  avatarPhotoMenuOpen.value = false;
  input.value = "";
  openAvatarEditor({ useCurrentAvatar: true });
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
      discardAvatarDraftFile();
    }
  }
);

onBeforeUnmount(discardAvatarDraftFile);
</script>

<template>
  <section class="soft-home ui-page-section profile-dashboard">
    <UiPageHeader class="profile-page-header" title="Профиль" subtitle="Аккаунт и доступ.">
      <template #actions>
        <div class="compact-controls profile-page-header-controls">
          <button class="ui-icon-button" type="button" :aria-label="t('language')" @click="changeLocale(currentLocale === 'ru' ? 'en' : 'ru')">
            {{ currentLocale.toUpperCase() }}
          </button>
          <NotificationCenter />
        </div>
      </template>
    </UiPageHeader>
    <section class="soft-card ui-card profile-access-card profile-dashboard-hero">
      <div class="profile-dashboard-toolbar">
        <div class="profile-access-layout">
        <div class="profile-avatar-stack">
          <button
            class="profile-avatar profile-avatar-large profile-avatar-trigger"
            type="button"
            aria-label="Изменить фото профиля"
            :disabled="avatarSaving"
            @click="openAvatarPhotoActions"
          >
            <img v-if="session.user?.photoUrl" :src="session.user.photoUrl" :alt="displayName" :style="avatarDisplayStyle" />
            <span v-else>{{ avatarInitial }}</span>
          </button>
        </div>
        <div class="profile-access-main">
          <div class="profile-access-head profile-identity-head">
            <div class="min-w-0">
              <div class="profile-display-name-row">
                <h3>{{ displayName }}</h3>
                <button
                  v-if="!session.user?.displayNameChangedByUserAt"
                  class="profile-name-edit profile-avatar-icon-button ui-icon-button"
                  type="button"
                  aria-label="Изменить ник"
                  @click="openDisplayNameEditor"
                >
                  <Pencil class="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  class="profile-avatar-icon-button ui-icon-button"
                  type="button"
                  :aria-label="avatarSaving ? t('profileAvatarUploading') : t('profileAvatarUpload')"
                  :title="avatarSaving ? t('profileAvatarUploading') : t('profileAvatarUpload')"
                  :disabled="avatarSaving"
                  @click="openAvatarPhotoActions"
                >
                  <Camera class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <small v-if="session.user?.displayNameChangedByUserAt" class="profile-name-locked">Изменение доступно через администратора</small>
            </div>
          </div>
          <button class="profile-account-inline" type="button" :aria-label="emailVisible ? t('profileEmailVisible') : t('profileEmailShow')" @click="emailVisible = true">
            <Fingerprint class="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />
            <span>Email</span>
            <strong :class="{ 'profile-secret-blurred': !emailVisible }">{{ accountEmail }}</strong>
          </button>
        </div>
        </div>
      </div>
      <div class="profile-dashboard-subscription">
        <div class="profile-membership-row">
          <div class="profile-membership-title">
            <strong>{{ profileSubscriptionStatusText }}</strong>
            <span v-if="isMember">до {{ accessUntil }}</span>
          </div>
          <div class="subscription-bar"><span :style="{ width: `${subscriptionProgress}%` }"></span></div>
          <span class="profile-dashboard-subscription-meta">{{ subscriptionMeta }}</span>
        </div>
        <button class="soft-inline-button ui-button" type="button" @click="$emit('openPayments')">
          {{ paymentActionText }}
        </button>
      </div>
      <p v-if="avatarMessage" class="profile-avatar-help">{{ avatarMessage }}</p>
      <p v-if="logoutMessage" class="profile-empty-text">{{ logoutMessage }}</p>
    </section>

    <div v-if="avatarPhotoMenuOpen" class="profile-modal-backdrop profile-photo-menu-backdrop" @click.self="avatarPhotoMenuOpen = false">
      <section class="profile-photo-menu ui-card" role="dialog" aria-modal="true" aria-label="Изменить фото профиля">
        <div class="profile-photo-menu-header">
          <div class="profile-photo-menu-preview" aria-hidden="true">
            <img v-if="session.user?.photoUrl" :src="session.user.photoUrl" alt="" :style="avatarDisplayStyle" />
            <span v-else>{{ avatarInitial }}</span>
          </div>
          <h3>Фото профиля</h3>
        </div>
        <label class="profile-photo-menu-action ui-button">
          <Camera class="h-4 w-4" aria-hidden="true" />
          <span>Загрузить новое фото</span>
          <input class="profile-upload-input" type="file" accept="image/jpeg,image/png,image/webp" :disabled="avatarSaving" @change="handleAvatarUpload" />
        </label>
        <button class="profile-photo-menu-action ui-button" type="button" @click="avatarPhotoMenuOpen = false; openAvatarEditor()">
          <Crop class="h-4 w-4" aria-hidden="true" />
          <span>Настроить кадр</span>
        </button>
        <button class="secondary-button ui-button" type="button" @click="avatarPhotoMenuOpen = false">Отмена</button>
      </section>
    </div>

    <section class="profile-summary-grid" aria-label="Краткая статистика">
      <article class="soft-card ui-card profile-summary-card">
        <div class="profile-summary-card-head"><BookOpen class="h-4 w-4" aria-hidden="true" /><span>Обучение</span></div>
        <strong>{{ completedItems }} из {{ totalItems }}</strong>
        <small>{{ learningProgress }}% · {{ lastOpenedTitle || t("lastOpenedEmpty") }}</small>
      </article>
      <button class="soft-card ui-card profile-summary-card profile-summary-card-button" type="button" @click="$emit('openPayments')">
        <div class="profile-summary-card-head"><CreditCard class="h-4 w-4" aria-hidden="true" /><span>Последняя оплата</span></div>
        <strong>{{ latestPaymentAmount }}</strong>
        <small>{{ latestPaymentDate }}</small>
      </button>
    </section>

    <nav class="profile-dashboard-nav" aria-label="Разделы профиля">
      <button class="profile-nav-row soft-card ui-card" type="button" @click='openProfilePanel("referrals")'>
        <span class="profile-nav-icon"><Gift class="h-5 w-5" aria-hidden="true" /></span>
        <span class="profile-nav-copy"><strong>{{ t("referralTitle") }}</strong><small>{{ referralSummaryText }}</small></span>
        <ChevronRight class="profile-nav-chevron" aria-hidden="true" />
      </button>
      <button class="profile-nav-row soft-card ui-card" type="button" @click='openProfilePanel("appearance")'>
        <span class="profile-nav-icon"><Palette class="h-5 w-5" aria-hidden="true" /></span>
        <span class="profile-nav-copy"><strong>{{ t("profileAppearance") }}</strong><small>{{ currentDesignThemeLabel }} · {{ currentThemeLabel }} · {{ visualScaleDisplayValue }}</small></span>
        <ChevronRight class="profile-nav-chevron" aria-hidden="true" />
      </button>
    </nav>

    <button class="profile-dashboard-logout ui-button ui-button--ghost" type="button" :disabled="logoutSaving" @click="showLogoutConfirm = true">
      <LogOut class="h-4 w-4" aria-hidden="true" />
      <span>{{ logoutSaving ? t("profileLogoutLoading") : t("profileLogout") }}</span>
    </button>

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

    <TaskScreen v-if='activeProfilePanel === "referrals"' class="profile-detail-task-screen" :title="t('referralTitle')" :subtitle="t('referralSubtitle')" portal @back="closeProfilePanel">
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
    </TaskScreen>

    <TaskScreen v-if='activeProfilePanel === "appearance"' class="profile-detail-task-screen" :title="t('profileAppearance')" :subtitle="`${currentDesignThemeLabel} · ${currentThemeLabel}`" portal @back="closeProfilePanel">
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
            class="design-theme-choice"
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

      <div class="visual-scale-control appearance-setting-card mt-3">
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

      <div class="profile-bottom-navigation-position appearance-setting-card mt-3">
        <span class="profile-bottom-navigation-copy">
          <strong>{{ t("profileBottomNavigationFlush") }}</strong>
          <small>{{ t("profileBottomNavigationFlushHint") }}</small>
        </span>
        <button
          class="appearance-switch"
          type="button"
          role="switch"
          :aria-checked="ui.bottomNavigationFlush"
          :aria-label="t('profileBottomNavigationFlush')"
          @click="ui.setBottomNavigationFlush(!ui.bottomNavigationFlush)"
        ></button>
      </div>

    </section>
    </TaskScreen>

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
              <img v-if="avatarEditorPreviewUrl" :src="avatarEditorPreviewUrl" :alt="displayName" :style="avatarDraftStyle" draggable="false" />
              <span v-else>{{ avatarInitial }}</span>
            </div>
            <p>{{ t("profileAvatarGestureHint") }}</p>
          </div>

          <div class="profile-avatar-editor-controls">
            <div class="profile-avatar-editor-zoom">
              <button class="ui-icon-button" type="button" :aria-label="t('profileAvatarZoomOut')" @click="zoomAvatar(-0.1)">
                <Minus class="h-4 w-4" aria-hidden="true" />
              </button>
              <strong>{{ Math.round(avatarDraftScale * 100) }}%</strong>
              <button class="ui-icon-button" type="button" :aria-label="t('profileAvatarZoomIn')" @click="zoomAvatar(0.1)">
                <Plus class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <button class="profile-avatar-center-button ui-button" type="button" :aria-label="t('profileAvatarCenter')" @click="resetAvatarDraft">
              <RotateCcw class="h-4 w-4" aria-hidden="true" />
              <span>{{ t("profileAvatarCenterShort") }}</span>
            </button>
          </div>
        </div>

        <div class="profile-modal-actions profile-avatar-editor-footer">
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
