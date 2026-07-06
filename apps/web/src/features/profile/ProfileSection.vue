<script setup lang="ts">
import type { PaymentOrderLog, ReferralSummary, UserRecurrentSubscription } from "@club/shared";
import { BarChart3, Check, Copy, Fingerprint, Gift, LogOut, Maximize2, Minimize2, Moon, Palette, RefreshCw, Sun, UserCircle } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { activateReferralRewards, getLearningHome, getPaymentHistory, getPaymentPlans, getReferralProfile } from "@/api/client";
import { useI18n, type Locale } from "@/features/app/i18n";
import NotificationCenter from "@/features/app/NotificationCenter.vue";
import { findActiveRecurrentSubscription, findRestorableRecurrentSubscription } from "@/features/billing/recurrentSubscription";
import {
  canUseReferralActivation,
  getProfileMembershipStatusText,
  getProfileMembershipStatusTone,
  getProfilePaymentActionText,
  getReferralRewardText
} from "@/features/profile/profileSubscriptionCopy";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type ColorScheme, type Theme } from "@/stores/ui";

defineEmits<{
  openPayments: [];
}>();

const session = useSessionStore();
const ui = useUiStore();
const { currentLocale, setLocale, t } = useI18n();

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
const emailVisible = ref(false);
const logoutSaving = ref(false);
const logoutMessage = ref<string | null>(null);
const accessUntil = computed(() =>
  session.user?.membershipExpiresAt ? new Date(session.user.membershipExpiresAt).toLocaleDateString() : t("notActive")
);
const displayName = computed(() => session.user?.firstName || session.user?.username || t("profileDefaultName"));
const accountEmail = computed(() => session.user?.email || session.user?.username || session.user?.telegramId || "");
const avatarInitial = computed(() => displayName.value.slice(0, 1).toUpperCase());
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
const avatarRefreshAvailableAt = computed(() => {
  if (!session.user?.avatarRefreshedAt) {
    return null;
  }

  return new Date(new Date(session.user.avatarRefreshedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
});
const avatarRefreshLocked = computed(() => {
  return Boolean(avatarRefreshAvailableAt.value && avatarRefreshAvailableAt.value.getTime() > Date.now());
});
const avatarRefreshHint = computed(() => {
  if (!avatarRefreshAvailableAt.value || !avatarRefreshLocked.value) {
    return t("profileAvatarRefreshHint");
  }

  return `${t("profileAvatarNextRefresh")}: ${avatarRefreshAvailableAt.value.toLocaleDateString(currentLocale.value === "ru" ? "ru-RU" : "en-US")}`;
});
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
const colorOptions = computed<Array<{ value: ColorScheme; label: string; colors: string[] }>>(() => [
  { value: "midnight", label: t("profileSchemeMidnight"), colors: ["#080922", "#f2f2f7"] },
  { value: "emerald", label: t("profileSchemeEmerald"), colors: ["#12382d", "#7dd3b0"] },
  { value: "graphite", label: t("profileSchemeGraphite"), colors: ["#242833", "#d6d9e2"] },
  { value: "sakura", label: t("profileSchemeSakura"), colors: ["#3a2034", "#f9a8d4"] },
  { value: "azure", label: t("profileSchemeAzure"), colors: ["#0f2f5f", "#7dd3fc"] },
  { value: "coffee", label: t("profileSchemeCoffee"), colors: ["#3a281f", "#d6ad7b"] }
]);

function changeLocale(locale: Locale) {
  setLocale(locale);
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

function getErrorStatus(reason: unknown) {
  if (typeof reason === "object" && reason && "status" in reason && typeof reason.status === "number") {
    return reason.status;
  }

  return null;
}

function getErrorData(reason: unknown) {
  if (typeof reason === "object" && reason && "data" in reason && typeof reason.data === "object") {
    return reason.data as { nextAllowedAt?: string; error?: string };
  }

  return null;
}

async function handleAvatarRefresh() {
  avatarSaving.value = true;
  avatarMessage.value = null;
  try {
    await session.updateAvatar();
    avatarMessage.value = t("profileAvatarUpdated");
  } catch (reason) {
    const data = getErrorData(reason);
    if (getErrorStatus(reason) === 429 && data?.nextAllowedAt) {
      avatarMessage.value = `${t("profileAvatarRefreshAfter")} ${new Date(data.nextAllowedAt).toLocaleDateString(currentLocale.value === "ru" ? "ru-RU" : "en-US")}.`;
    } else if (getErrorStatus(reason) === 400) {
      avatarMessage.value = t("profileAvatarUnavailable");
    } else {
      avatarMessage.value = t("profileAvatarError");
    }
  } finally {
    avatarSaving.value = false;
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
});
</script>

<template>
  <section class="soft-home space-y-4">
    <div class="section-head">
      <div>
        <h2 class="section-title">Профиль</h2>
        <p class="section-subtitle">Доступ, статистика и настройки аккаунта.</p>
      </div>
      <div class="compact-controls shrink-0">
        <button
          type="button"
          :aria-label="t('language')"
          @click="changeLocale(currentLocale === 'ru' ? 'en' : 'ru')"
        >
          {{ currentLocale.toUpperCase() }}
        </button>
        <NotificationCenter />
      </div>
    </div>

    <section class="soft-card">
      <div class="profile-hero-row">
        <div class="profile-avatar profile-avatar-large">
          <img v-if="session.user?.photoUrl" :src="session.user.photoUrl" :alt="displayName" />
          <span v-else>{{ avatarInitial }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="section-eyebrow">{{ t("status") }}</p>
          <h3>{{ displayName }}</h3>
          <p class="profile-subscription-status mt-1" :class="profileSubscriptionStatusClass">
            {{ profileSubscriptionStatusText }}
          </p>
          <p class="mt-1 text-xs font-semibold text-[var(--muted)]">
            {{ paymentStatusText }}<template v-if="paymentDateText"> · {{ paymentDateText }}</template>
          </p>
        </div>
        <span class="soft-pill">{{ accessUntil }}</span>
      </div>
      <div class="mt-4">
        <div class="subscription-bar">
          <span :style="{ width: `${subscriptionProgress}%` }"></span>
        </div>
        <div class="profile-subscription-meta mt-2 flex items-center justify-between text-xs font-semibold text-[var(--muted)]">
          <span>{{ subscriptionMeta }}</span>
          <span v-if="isMember">до {{ accessUntil }}</span>
        </div>
      </div>
      <button class="soft-inline-button mt-4" type="button" @click="$emit('openPayments')">
        {{ paymentActionText }}
      </button>
    </section>

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

    <section class="soft-card profile-referral-card">
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
          <button type="button" :aria-label="t('referralCopy')" @click="copyReferralLink">
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
          class="soft-inline-button"
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

    <section class="soft-card profile-account-card">
      <div class="profile-card-head">
        <h3 class="soft-section-title">{{ t("profileAccount") }}</h3>
        <UserCircle class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </div>

      <div class="profile-info-list mt-3">
        <div class="profile-info-row">
          <span>{{ t("profileName") }}</span>
          <strong>{{ displayName }}</strong>
        </div>
        <div class="profile-info-row">
          <span>Email</span>
          <button
            class="profile-secret-value"
            type="button"
            :aria-label="emailVisible ? t('profileEmailVisible') : t('profileEmailShow')"
            @click="emailVisible = true"
          >
            <Fingerprint class="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />
            <strong :class="{ 'profile-secret-blurred': !emailVisible }">
              {{ accountEmail }}
            </strong>
          </button>
        </div>
        <div class="profile-info-row">
          <span>{{ t("role") }}</span>
          <strong>{{ roleLabel }}</strong>
        </div>
      </div>
      <div class="profile-avatar-refresh mt-3">
        <button class="secondary-button" type="button" :disabled="avatarSaving || avatarRefreshLocked" @click="handleAvatarRefresh">
          <RefreshCw class="h-4 w-4" aria-hidden="true" />
          <span>{{ avatarSaving ? t("profileAvatarUpdating") : t("profileAvatarUpdate") }}</span>
        </button>
        <p>{{ avatarMessage || avatarRefreshHint }}</p>
      </div>
      <div class="profile-account-actions mt-3">
        <button class="secondary-button profile-logout-button" type="button" :disabled="logoutSaving" @click="handleLogout">
          <LogOut class="h-4 w-4" aria-hidden="true" />
          <span>{{ logoutSaving ? t("profileLogoutLoading") : t("profileLogout") }}</span>
        </button>
        <p v-if="logoutMessage" class="profile-empty-text">{{ logoutMessage }}</p>
      </div>
    </section>

    <section class="soft-card">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("profilePaymentHistory") }}</h3>
        <button class="soft-link" type="button" @click="$emit('openPayments')">{{ t("payment") }}</button>
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

    <section class="soft-card profile-settings">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">{{ t("profileAppearance") }}</h3>
        <Palette class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </div>

      <div class="theme-choice-row mt-3">
        <button
          v-for="option in themeOptions"
          :key="option.value"
          class="theme-choice"
          :class="{ 'theme-choice-active': ui.theme === option.value }"
          type="button"
          @click="ui.setTheme(option.value)"
        >
          <component :is="option.icon" class="h-4 w-4" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </button>
      </div>

      <div class="profile-window-mode mt-3">
        <div>
          <h4>{{ t("profileWindowMode") }}</h4>
          <p>{{ t("profileWindowModeText") }}</p>
        </div>
        <div class="theme-choice-row">
          <button
            class="theme-choice"
            :class="{ 'theme-choice-active': ui.fullscreenEnabled }"
            type="button"
            @click="ui.setFullscreenEnabled(true)"
          >
            <Maximize2 class="h-4 w-4" aria-hidden="true" />
            <span>{{ t("profileFullscreen") }}</span>
          </button>
          <button
            class="theme-choice"
            :class="{ 'theme-choice-active': !ui.fullscreenEnabled }"
            type="button"
            @click="ui.setFullscreenEnabled(false)"
          >
            <Minimize2 class="h-4 w-4" aria-hidden="true" />
            <span>{{ t("profileWindowNormal") }}</span>
          </button>
        </div>
      </div>

      <div class="scheme-grid mt-3">
        <button
          v-for="option in colorOptions"
          :key="option.value"
          class="scheme-choice"
          :class="{ 'scheme-choice-active': ui.colorScheme === option.value }"
          type="button"
          @click="ui.setColorScheme(option.value)"
        >
          <span class="scheme-swatch" aria-hidden="true">
            <span :style="{ background: option.colors[0] }"></span>
            <span :style="{ background: option.colors[1] }"></span>
          </span>
          <span>{{ option.label }}</span>
          <Check v-if="ui.colorScheme === option.value" class="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  </section>
</template>
