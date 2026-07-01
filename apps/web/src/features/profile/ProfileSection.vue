<script setup lang="ts">
import type { PaymentOrderLog, UserRecurrentSubscription } from "@club/shared";
import { BarChart3, Check, Fingerprint, Maximize2, Minimize2, Moon, Palette, RefreshCw, Sun, UserCircle } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { getLearningHome, getPaymentHistory, getPaymentPlans } from "@/api/client";
import { useI18n, type Locale } from "@/features/app/i18n";
import NotificationCenter from "@/features/app/NotificationCenter.vue";
import { findActiveRecurrentSubscription, findRestorableRecurrentSubscription } from "@/features/billing/recurrentSubscription";
import { getProfilePaymentActionText } from "@/features/profile/profileSubscriptionCopy";
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
const avatarSaving = ref(false);
const avatarMessage = ref<string | null>(null);
const telegramIdVisible = ref(false);
const accessUntil = computed(() =>
  session.user?.membershipExpiresAt ? new Date(session.user.membershipExpiresAt).toLocaleDateString() : t("notActive")
);
const displayName = computed(() => session.user?.firstName || session.user?.username || "Пользователь");
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
    return "Ожидает оплаты";
  }

  if (daysLeft.value === 0) {
    return "Доступ заканчивается сегодня";
  }

  return `${daysLeft.value} дн. осталось`;
});
const paymentStatusText = computed(() => {
  if (!isMember.value) {
    return "Доступ не активен";
  }

  if (session.user?.paymentType === "recurrent") {
    return session.user.recurrentPaymentStatus === "cancelled" ? "Автоматический платёж отменен" : "Автоматический платёж";
  }

  if (session.user?.paymentType === "one_time") {
    return "Разовый платёж";
  }

  if (session.user?.paymentType === "manual") {
    return "Ручной доступ";
  }

  return "Доступ активен";
});
const paymentDateText = computed(() => {
  if (!isMember.value) {
    return null;
  }

  if (session.user?.paymentType === "recurrent" && session.user.recurrentPaymentStatus === "active" && session.user.nextPaymentAt) {
    return `следующее списание ${new Date(session.user.nextPaymentAt).toLocaleDateString("ru-RU")}`;
  }

  if (session.user?.paymentType === "recurrent" && session.user.recurrentPaymentStatus === "cancelled" && session.user.membershipExpiresAt) {
    return `работает до ${new Date(session.user.membershipExpiresAt).toLocaleDateString("ru-RU")}`;
  }

  if (session.user?.paymentType === "one_time" && session.user.membershipExpiresAt) {
    return `работает до ${new Date(session.user.membershipExpiresAt).toLocaleDateString("ru-RU")}`;
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
    return "Можно обновить, если фото изменилось в Telegram.";
  }

  return `Следующее ручное обновление: ${avatarRefreshAvailableAt.value.toLocaleDateString("ru-RU")}`;
});
const learningProgress = computed(() => {
  if (!totalItems.value) {
    return 0;
  }

  return Math.round((completedItems.value / totalItems.value) * 100);
});
const isStatsEmpty = computed(() => completedItems.value === 0 && !lastOpenedTitle.value);
const themeOptions: Array<{ value: Theme; label: string; icon: typeof Moon }> = [
  { value: "dark", label: "Ночь", icon: Moon },
  { value: "light", label: "День", icon: Sun }
];
const colorOptions: Array<{ value: ColorScheme; label: string; colors: string[] }> = [
  { value: "midnight", label: "Полночь", colors: ["#080922", "#f2f2f7"] },
  { value: "emerald", label: "Хвоя", colors: ["#12382d", "#7dd3b0"] },
  { value: "graphite", label: "Графит", colors: ["#242833", "#d6d9e2"] },
  { value: "sakura", label: "Сакура", colors: ["#3a2034", "#f9a8d4"] },
  { value: "azure", label: "Лагуна", colors: ["#0f2f5f", "#7dd3fc"] },
  { value: "coffee", label: "Кофе", colors: ["#3a281f", "#d6ad7b"] }
];

function changeLocale(locale: Locale) {
  setLocale(locale);
}

function paymentOrderStatusLabel(status: PaymentOrderLog["status"]) {
  if (status === "paid") {
    return "Оплачен";
  }

  if (status === "failed") {
    return "Ошибка";
  }

  if (status === "cancelled") {
    return "Отменён";
  }

  return "Ожидает оплату";
}

function paymentOrderDate(order: PaymentOrderLog) {
  return new Date(order.paidAt ?? order.createdAt).toLocaleString("ru-RU", {
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
    avatarMessage.value = "Аватарка обновлена.";
  } catch (reason) {
    const data = getErrorData(reason);
    if (getErrorStatus(reason) === 429 && data?.nextAllowedAt) {
      avatarMessage.value = `Можно обновить после ${new Date(data.nextAllowedAt).toLocaleDateString("ru-RU")}.`;
    } else if (getErrorStatus(reason) === 400) {
      avatarMessage.value = "Telegram пока не передал фото профиля.";
    } else {
      avatarMessage.value = "Не удалось обновить аватарку.";
    }
  } finally {
    avatarSaving.value = false;
  }
}

onMounted(async () => {
  const [learningResult, paymentsResult, plansResult] = await Promise.allSettled([
    getLearningHome(),
    getPaymentHistory(),
    getPaymentPlans()
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
          <p class="mt-1 text-sm font-semibold text-[var(--muted)]">
            {{ isMember ? t("softPremiumActive") : t("homeInactive") }}
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

    <section class="soft-card profile-account-card">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">Аккаунт</h3>
        <UserCircle class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
      </div>

      <div class="profile-info-list mt-3">
        <div class="profile-info-row">
          <span>Имя</span>
          <strong>{{ displayName }}</strong>
        </div>
        <div class="profile-info-row">
          <span>Telegram ID</span>
          <button
            class="profile-secret-value"
            type="button"
            :aria-label="telegramIdVisible ? 'Telegram ID открыт' : 'Показать Telegram ID'"
            @click="telegramIdVisible = true"
          >
            <Fingerprint class="h-3.5 w-3.5 text-[var(--muted)]" aria-hidden="true" />
            <strong :class="{ 'profile-secret-blurred': !telegramIdVisible }">
              {{ session.user?.telegramId }}
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
          <span>{{ avatarSaving ? "Обновляем..." : "Обновить аватарку" }}</span>
        </button>
        <p>{{ avatarMessage || avatarRefreshHint }}</p>
      </div>
    </section>

    <section class="soft-card">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">История оплат</h3>
        <button class="soft-link" type="button" @click="$emit('openPayments')">Оплата</button>
      </div>
      <div class="payment-log-list mt-3">
        <article v-for="order in paymentOrders.slice(0, 5)" :key="order.id" class="payment-log-card">
          <div>
            <strong>{{ order.productTitle }}</strong>
            <span>{{ paymentOrderDate(order) }} · {{ order.amountRub.toLocaleString("ru-RU") }} ₽</span>
          </div>
          <em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em>
        </article>
        <p v-if="!paymentOrders.length" class="profile-empty-text">Оплат пока нет.</p>
      </div>
    </section>

    <section class="soft-card profile-settings">
      <div class="flex items-center justify-between gap-3">
        <h3 class="soft-section-title">Оформление</h3>
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
          <h4>Режим окна</h4>
          <p>Выберите, как удобнее открывать миниапп в Telegram.</p>
        </div>
        <div class="theme-choice-row">
          <button
            class="theme-choice"
            :class="{ 'theme-choice-active': ui.fullscreenEnabled }"
            type="button"
            @click="ui.setFullscreenEnabled(true)"
          >
            <Maximize2 class="h-4 w-4" aria-hidden="true" />
            <span>Во весь экран</span>
          </button>
          <button
            class="theme-choice"
            :class="{ 'theme-choice-active': !ui.fullscreenEnabled }"
            type="button"
            @click="ui.setFullscreenEnabled(false)"
          >
            <Minimize2 class="h-4 w-4" aria-hidden="true" />
            <span>Обычный</span>
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
