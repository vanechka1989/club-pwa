<script setup lang="ts">
import type { AdminLoginIp, AdminStatsUser, AdminUserDetailResponse, PaymentOrderLog } from "@club/shared";
import { ChevronRight, Copy, Paperclip, SlidersHorizontal, X } from "lucide-vue-next";
import { defineAsyncComponent, ref } from "vue";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { formatMembershipStatus } from "@/features/app/i18n";
import {
  getAdminClientAccessState,
  getAdminSubscriptionActorLabel,
  getAdminSubscriptionSourceLabel,
  getAdminSubscriptionTitle,
  getAdminTariffLabel
} from "./adminClientCard";
import { allClientSourcesFilter, untaggedClientSourceFilter, type AdminClientUtmField } from "./adminClientAcquisitionFilters";
import { formatAdminClientLastLogin, getAdminClientContact } from "./adminClientList";
import { formatAdminPaymentMoney } from "./adminPaymentMoney";

const AdminClientAcquisition = defineAsyncComponent(() => import("./AdminClientAcquisition.vue"));

type ClientFilters = {
  query: string;
  subscription: "all" | "active" | "closed";
  tariff: string;
  restrictions: "all" | "restricted";
  source: string;
  utmField: AdminClientUtmField;
  utmValue: string;
};

type ClientSummary = {
  total: number;
  active: number;
  restricted: number;
};

type ClientMessageDraft = {
  open: boolean;
  text: string;
  files: readonly File[];
  sending: boolean;
};

type ClientAccessAction = "open" | "close" | "extend7" | "extend30" | "manual";
type ClientDevice = AdminUserDetailResponse["devices"][number];

const props = defineProps<{
  summary: ClientSummary;
  filters: Readonly<ClientFilters>;
  filtersActive: boolean;
  tariffOptions: ReadonlyArray<{ value: string; label: string }>;
  clientSourceOptions: ReadonlyArray<{ value: string; label: string }>;
  filteredUsers: readonly AdminStatsUser[];
  selectedUser: Readonly<AdminStatsUser> | null;
  selectedUserDetail: Readonly<AdminUserDetailResponse> | null;
  selectedUserPaymentOrders: readonly PaymentOrderLog[];
  selectedUserLastPayment: Readonly<PaymentOrderLog> | null;
  selectedUserPaidTotal: number;
  selectedUserDevices: readonly ClientDevice[];
  selectedUserDeviceText: string;
  selectedUserLoginIps: readonly AdminLoginIp[];
  selectedUserLoginIpsLoading: boolean;
  selectedUserLoginIpsError: boolean;
  accessExpiresAt: string;
  pendingClientAccessAction: ClientAccessAction | null;
  accessSaveSucceeded: boolean;
  accessSaveButtonText: string;
  clientAccessBusy: boolean;
  canGrantClientAccess: boolean;
  canManageSelectedUser: boolean;
  canManageSelectedUserAccess: boolean;
  canViewLoginIps: boolean;
  saving: boolean;
  clientMessage: Readonly<ClientMessageDraft>;
  userTitle: (user: AdminStatsUser) => string;
  userInitial: (user: AdminStatsUser) => string;
  selectedUserMeta: (user: AdminStatsUser) => string;
  getAccessActionSummary: (user: AdminStatsUser) => string;
  paymentOrderDate: (order: PaymentOrderLog) => string;
  paymentOrderStatusLabel: (status: PaymentOrderLog["status"]) => string;
  formatAdminDateTime: (value: string) => string;
  formatAdminShortDate: (value: string) => string;
  formatAdminCompactDateTime: (value: string) => string;
  formatLearningEngagementDuration: (seconds: number) => string;
  referralUserTitle: (user: { telegramId: string; firstName: string | null; username: string | null }) => string;
  referralRewardStatusLabel: (status: "none" | "available" | "activated") => string;
  getClientDeviceTitle: (device: ClientDevice["diagnostics"]) => string;
  getClientDeviceScreen: (device: ClientDevice["diagnostics"]) => string;
  isNewLoginIp: (entry: AdminLoginIp) => boolean;
}>();

const emit = defineEmits<{
  "update:filters": [filters: ClientFilters];
  "reset-filters": [];
  "select-user": [user: AdminStatsUser];
  "client-card-close": [];
  "update:access-expires-at": [value: string];
  "open-access": [];
  "close-access": [];
  "extend-access": [days: 7 | 30];
  "manual-access": [];
  "quick-mute": [user: AdminStatsUser];
  "open-message": [];
  "close-message": [];
  "update:client-message-text": [value: string];
  "update:client-message-files": [files: File[]];
  "submit-message": [];
  "revoke-mute": [id: string];
  "copy-device-info": [text: string];
}>();

const clientMessageInput = ref<HTMLTextAreaElement | null>(null);

defineExpose({
  getClientMessageInput: () => clientMessageInput.value
});

function updateFilters(patch: Partial<ClientFilters>) {
  emit("update:filters", { ...props.filters, ...patch });
}

function updateClientMessageFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  emit("update:client-message-files", Array.from(input.files ?? []).slice(0, 4));
  input.value = "";
}
</script>

<template>
  <section class="admin-panel ui-page-section">
    <div class="admin-panel-head ui-page-header">
      <div><h3>Клиенты и доступ</h3><p>Поиск, продление доступа, быстрый мут и просмотр статистики.</p></div>
    </div>

    <section class="admin-client-overview" aria-label="Сводка по клиентам">
      <article><span>Всего</span><strong>{{ summary.total }}</strong></article>
      <article><span>С доступом</span><strong>{{ summary.active }}</strong></article>
      <article><span>Ограничены</span><strong>{{ summary.restricted }}</strong></article>
    </section>

    <div class="admin-client-searchbar">
      <input :value="filters.query" class="text-input" placeholder="Поиск по ID, имени или username" @input="updateFilters({ query: ($event.target as HTMLInputElement).value.trim() })" />
      <span>Найдено: {{ filteredUsers.length }}</span>
    </div>
    <div class="admin-client-filter-chips" aria-label="Быстрые фильтры клиентов">
      <button type="button" :class="{ active: filters.subscription === 'all' && filters.restrictions === 'all' }" @click="updateFilters({ subscription: 'all', restrictions: 'all' })">Все</button>
      <button type="button" :class="{ active: filters.subscription === 'active' }" @click="updateFilters({ subscription: 'active', restrictions: 'all' })">Активные</button>
      <button type="button" :class="{ active: filters.subscription === 'closed' }" @click="updateFilters({ subscription: 'closed', restrictions: 'all' })">Закрыты</button>
      <button type="button" :class="{ active: filters.restrictions === 'restricted' }" @click="updateFilters({ restrictions: 'restricted', subscription: 'all' })">Ограничены</button>
    </div>
    <details class="admin-client-more-filters">
      <summary><SlidersHorizontal class="h-4 w-4" /> Дополнительные фильтры</summary>
      <div class="admin-filter-grid ui-responsive-grid">
        <select :value="filters.subscription" class="text-input" @change="updateFilters({ subscription: ($event.target as HTMLSelectElement).value as ClientFilters['subscription'] })">
          <option value="all">Любой доступ</option><option value="active">Доступ открыт</option><option value="closed">Доступ закрыт</option>
        </select>
        <select :value="filters.tariff" class="text-input" @change="updateFilters({ tariff: ($event.target as HTMLSelectElement).value })">
          <option v-for="tariff in tariffOptions" :key="tariff.value" :value="tariff.value">{{ tariff.label }}</option>
        </select>
        <select :value="filters.restrictions" class="text-input" @change="updateFilters({ restrictions: ($event.target as HTMLSelectElement).value as ClientFilters['restrictions'] })">
          <option value="all">Все клиенты</option><option value="restricted">С ограничениями</option>
        </select>
        <div class="admin-client-acquisition-filters">
          <select :value="filters.source" class="text-input" aria-label="Источник клиента" @change="updateFilters({ source: ($event.target as HTMLSelectElement).value })">
            <option :value="allClientSourcesFilter">Любой источник</option><option :value="untaggedClientSourceFilter">Без метки</option>
            <option v-for="source in clientSourceOptions" :key="source.value" :value="source.value">{{ source.label }}</option>
          </select>
          <select :value="filters.utmField" class="text-input" aria-label="Поле UTM" @change="updateFilters({ utmField: ($event.target as HTMLSelectElement).value as AdminClientUtmField })">
            <option value="all">Любая UTM-метка</option><option value="source">utm_source</option><option value="medium">utm_medium</option><option value="campaign">utm_campaign</option><option value="content">utm_content</option>
          </select>
          <input :value="filters.utmValue" class="text-input" aria-label="Значение UTM" placeholder="Значение UTM" @input="updateFilters({ utmValue: ($event.target as HTMLInputElement).value.trim() })" />
        </div>
        <button class="secondary-button ui-button admin-filter-reset" type="button" :disabled="!filtersActive" @click="emit('reset-filters')">Сбросить</button>
      </div>
    </details>

    <div class="admin-user-layout"><div class="admin-list">
      <p class="admin-client-sort-note">Последний вход ↓</p>
      <button
        v-for="user in filteredUsers"
        :key="user.id"
        class="admin-list-item ui-card admin-client-list-row"
        :class="[
          `admin-client-list-row-${getAdminClientAccessState(user).tone}`,
          { 'admin-list-item-active': selectedUser?.id === user.id }
        ]"
        type="button"
        @click="emit('select-user', user)"
      >
        <span class="admin-client-status-rail" aria-hidden="true"></span>
        <span class="admin-client-list-avatar"><img v-if="user.photoUrl" :src="user.photoUrl" :alt="userTitle(user)" loading="lazy" decoding="async" /><span v-else>{{ userInitial(user) }}</span></span>
        <span class="admin-list-item-main">
          <span class="admin-client-list-name-line"><strong>{{ userTitle(user) }}</strong></span>
          <small v-if="getAdminClientContact(user)" class="admin-client-list-contact">{{ getAdminClientContact(user) }}</small>
          <span class="admin-client-list-metrics">
            <span>{{ getAdminTariffLabel(user.tariff) }}</span>
            <span class="admin-list-item-progress">Уроки {{ user.completedItems }}/{{ user.totalItems }}</span>
          </span>
        </span>
        <span class="admin-client-last-visit">
          <small>Последний вход</small>
          <strong>{{ formatAdminClientLastLogin(user.lastLoginAt, formatAdminCompactDateTime) }}</strong>
          <em v-if="user.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</em>
          <em class="admin-access-badge" :class="`admin-access-badge-${getAdminClientAccessState(user).tone}`">{{ getAdminClientAccessState(user).label }}</em>
        </span>
        <span class="admin-client-list-chevron"><ChevronRight aria-hidden="true" /></span>
      </button>
    </div></div>

    <TaskScreen v-if="selectedUser" class="admin-task-screen admin-client-task-screen" :title="userTitle(selectedUser)" :subtitle="selectedUserMeta(selectedUser)" portal @back="emit('client-card-close')">
      <div class="admin-client-workspace">
        <header class="admin-client-identity admin-detail ui-card"><div class="admin-client-card-head"><span class="admin-client-avatar"><img v-if="selectedUser.photoUrl" :src="selectedUser.photoUrl" :alt="userTitle(selectedUser)" /><span v-else>{{ userInitial(selectedUser) }}</span></span><div class="admin-client-card-title"><div class="admin-client-title-row"><h3 id="admin-client-modal-title">{{ userTitle(selectedUser) }}</h3></div><p>{{ selectedUserMeta(selectedUser) }}</p><span class="admin-client-last-login">Последний вход: {{ formatAdminCompactDateTime(selectedUser.lastLoginAt) }}</span></div></div><div class="admin-client-status-row"><span v-if="selectedUser.marketingEmailOptOutAt" class="admin-email-opt-out-badge">Email отключён</span><span class="admin-status-pill" :class="`admin-access-badge-${getAdminClientAccessState(selectedUser).tone}`">{{ getAdminClientAccessState(selectedUser).label }}</span><span v-if="selectedUser.membershipExpiresAt" class="admin-status-pill admin-status-pill-yellow">до {{ formatAdminShortDate(selectedUser.membershipExpiresAt) }}</span><span class="admin-status-pill admin-status-pill-blue">{{ getAdminTariffLabel(selectedUser.tariff) }}</span></div></header>

        <section class="admin-client-kpi-grid" aria-label="Краткая сводка клиента"><article class="admin-client-kpi"><span>Доступ</span><strong>{{ selectedUser.membershipExpiresAt ? `до ${formatAdminShortDate(selectedUser.membershipExpiresAt)}` : formatMembershipStatus(selectedUser.membershipStatus) }}</strong></article><article class="admin-client-kpi"><span>Обучение</span><strong>{{ selectedUser.completedItems }} / {{ selectedUser.totalItems }}</strong></article><article class="admin-client-kpi"><span>Оплаты</span><strong>{{ selectedUserPaidTotal.toLocaleString('ru-RU') }} ₽</strong></article><article class="admin-client-kpi"><span>Последнее действие</span><strong>{{ selectedUser.lastOpenedItemTitle ?? 'Нет активности' }}</strong></article></section>

        <section class="admin-client-action-panel admin-detail ui-card" aria-label="Действия с клиентом"><div class="admin-client-action-head"><strong>Действие</strong><small>{{ getAccessActionSummary(selectedUser) }}</small></div><div class="admin-access-toggle"><button class="admin-access-open" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'open' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('open-access')">{{ pendingClientAccessAction === 'open' ? 'Открываю...' : 'Открыть доступ' }}</button><button class="admin-access-close" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'close' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('close-access')">{{ pendingClientAccessAction === 'close' ? 'Закрываю...' : 'Закрыть доступ' }}</button><button class="admin-access-add" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend7' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('extend-access', 7)">{{ pendingClientAccessAction === 'extend7' ? 'Продлеваю...' : '+7 дней' }}</button><button class="admin-access-add" :class="{ 'admin-access-button-pending': pendingClientAccessAction === 'extend30' }" type="button" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess" @click="emit('extend-access', 30)">{{ pendingClientAccessAction === 'extend30' ? 'Продлеваю...' : '+30 дней' }}</button></div><form class="admin-compact-date-row" @submit.prevent="emit('manual-access')"><label class="admin-date-action"><span>Ручной доступ</span><input :value="accessExpiresAt" type="date" aria-label="Дата окончания доступа" :disabled="!canManageSelectedUserAccess" @input="emit('update:access-expires-at', ($event.target as HTMLInputElement).value)" /></label><button class="admin-client-mute-action" type="button" :disabled="saving || !canManageSelectedUser" @click="emit('quick-mute', selectedUser)">Мут до снятия</button><button class="admin-date-save" :class="{ 'admin-save-success': accessSaveSucceeded, 'admin-access-button-pending': pendingClientAccessAction === 'manual' }" type="submit" :disabled="saving || clientAccessBusy || !canManageSelectedUserAccess">{{ pendingClientAccessAction === 'manual' ? 'Сохраняю...' : accessSaveButtonText }}</button></form></section>

        <div class="admin-client-primary-actions"><button class="primary-button ui-button admin-message-client-button" type="button" :disabled="saving" @click="emit('open-message')">Написать клиенту</button></div>
        <p v-if="!canGrantClientAccess" class="admin-warning-line">Для выдачи доступа нужно право Доступы.</p><p v-else-if="!canManageSelectedUser" class="admin-warning-line">Менять доступ и ограничения администраторов может только главный админ.</p>
        <AdminClientAcquisition :telegram-id="selectedUser.telegramId" />

        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Активность <span>последние события</span></summary><div class="admin-client-section-head admin-client-section-head-hidden"><h4>Активность</h4><small>последние события</small></div><div class="admin-client-timeline"><article v-if="selectedUser.lastOpenedItemTitle"><span class="admin-client-dot admin-client-dot-green"></span><strong>Открыл урок &quot;{{ selectedUser.lastOpenedItemTitle }}&quot;</strong><time>{{ selectedUser.lastOpenedAt ? formatAdminCompactDateTime(selectedUser.lastOpenedAt) : 'время не сохранено' }}</time></article><article v-if="selectedUserLastPayment"><span class="admin-client-dot admin-client-dot-blue"></span><strong>Оплата: {{ formatAdminPaymentMoney(selectedUserLastPayment) }}</strong><time>{{ paymentOrderDate(selectedUserLastPayment) }}</time></article><p v-if="!selectedUser.lastOpenedItemTitle && !selectedUserLastPayment" class="admin-empty">Последних событий пока нет.</p></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Просмотры обучения <span>{{ selectedUserDetail?.learningEngagement.length ?? 0 }} карточек</span></summary><div class="admin-accordion-body"><p v-if="!selectedUserDetail?.learningEngagement.length" class="admin-empty">Данных об активном просмотре пока нет.</p><article v-for="item in selectedUserDetail?.learningEngagement ?? []" :key="item.contentItemId" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ item.title }}</strong><small>{{ item.categoryTitle }}</small></div><em>{{ formatLearningEngagementDuration(item.totalActiveSeconds) }}</em></div><div class="admin-payment-meta"><span>{{ item.opens }} открытий</span><span v-if="item.videoSeconds">видео {{ formatLearningEngagementDuration(item.videoSeconds) }}</span><span>последний просмотр {{ formatAdminCompactDateTime(item.lastViewedAt) }}</span></div></article></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Подписки <span>{{ selectedUserDetail?.subscriptions.length ?? 0 }} записей</span></summary><div class="admin-accordion-body"><p v-if="!selectedUserDetail?.subscriptions.length" class="admin-empty">Истории подписок пока нет.</p><article v-for="subscription in selectedUserDetail?.subscriptions ?? []" :key="subscription.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ getAdminSubscriptionTitle(subscription) }}</strong><small>{{ getAdminSubscriptionSourceLabel(subscription) }}</small></div><em :class="`membership-history-status-${subscription.status}`">{{ formatMembershipStatus(subscription.status) }}</em></div><div class="admin-payment-meta"><span>{{ new Date(subscription.createdAt).toLocaleDateString('ru-RU') }}</span><span v-if="subscription.expiresAt">до {{ new Date(subscription.expiresAt).toLocaleDateString('ru-RU') }}</span><span v-if="getAdminSubscriptionActorLabel(subscription)">{{ getAdminSubscriptionActorLabel(subscription) }}</span></div></article></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Оплаты клиента <span>{{ selectedUserPaymentOrders.length }} записей</span></summary><div class="admin-accordion-body"><p v-if="!selectedUserPaymentOrders.length" class="admin-empty">Оплат пока нет.</p><article v-for="order in selectedUserPaymentOrders" :key="order.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ order.productTitle }}</strong><small>{{ paymentOrderDate(order) }} · {{ formatAdminPaymentMoney(order) }}</small></div><em :class="`payment-status-${order.status}`">{{ paymentOrderStatusLabel(order.status) }}</em></div><div class="admin-payment-ids"><span>order: {{ order.providerOrderId }}</span><span>Webhook: {{ order.webhook ? (order.webhook.isValid ? 'валидный' : 'ошибка подписи') : 'не пришёл' }}</span></div></article></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Рефералы <span>{{ selectedUserDetail?.referrals.invited.length ?? 0 }} приглашённых</span></summary><div class="admin-accordion-body"><article v-if="selectedUserDetail?.referrals.invitedBy" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>Пришёл по ссылке</strong><small>{{ referralUserTitle(selectedUserDetail.referrals.invitedBy.inviterUser) }}</small></div><em>{{ formatAdminDateTime(selectedUserDetail.referrals.invitedBy.invitedAt) }}</em></div><div class="admin-payment-meta"><span>ID {{ selectedUserDetail.referrals.invitedBy.inviterUser.telegramId }}</span><span v-if="selectedUserDetail.referrals.invitedBy.firstPaidAt">первая оплата {{ formatAdminDateTime(selectedUserDetail.referrals.invitedBy.firstPaidAt) }}</span><span v-else>первой оплаты ещё нет</span></div></article><p v-if="!selectedUserDetail?.referrals.invitedBy && !selectedUserDetail?.referrals.invited.length" class="admin-empty">Реферальных связей пока нет.</p><article v-for="referral in selectedUserDetail?.referrals.invited ?? []" :key="referral.id" class="admin-payment-card admin-payment-card-compact"><div class="admin-payment-main"><div><strong>{{ referralUserTitle(referral.invitedUser) }}</strong><small>приглашён {{ formatAdminDateTime(referral.invitedAt) }}</small></div><em>{{ referralRewardStatusLabel(referral.rewardStatus) }}</em></div><div class="admin-payment-meta"><span>ID {{ referral.invitedUser.telegramId }}</span><span>{{ referral.rewardDays }} дн. вознаграждения</span><span v-if="referral.firstPaidAt">первая оплата {{ formatAdminDateTime(referral.firstPaidAt) }}</span><span v-else>оплаты ещё нет</span></div></article></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card"><summary>Ограничения и удаления <span>{{ selectedUserDetail?.moderationEvents.length ?? 0 }} записей</span></summary><div class="admin-accordion-body"><p v-if="!selectedUserDetail?.moderationEvents.length" class="admin-empty">Ограничений и удалений пока нет.</p><article v-for="event in selectedUserDetail?.moderationEvents ?? []" :key="`${event.kind}-${event.id}`" class="admin-log-item"><time>{{ new Date(event.createdAt).toLocaleString('ru-RU') }}</time><div><strong>{{ event.kind === 'mute' ? 'Мут' : event.kind === 'chat_message' ? 'Сообщение' : 'Комментарий' }} · {{ event.status }}</strong><span v-if="event.sourceTitle">{{ event.sourceTitle }}</span><p v-if="event.body">{{ event.body }}</p><small v-if="event.resolvedAt">обработано {{ new Date(event.resolvedAt).toLocaleString('ru-RU') }}</small><button v-if="event.kind === 'mute' && !event.resolvedAt && canManageSelectedUser" class="secondary-button ui-button mt-2" type="button" :disabled="saving" @click="emit('revoke-mute', event.id)">Снять мут</button></div></article></div></details>
        <details class="admin-client-section admin-client-compact-section admin-detail ui-card admin-client-device-history"><summary>Устройства <span>{{ selectedUserDevices.length }} сохранено</span></summary><div class="admin-client-section-head admin-client-section-head-hidden"><h4>Устройства</h4><button class="admin-client-copy-button" type="button" :disabled="!selectedUserDeviceText" @click="emit('copy-device-info', selectedUserDeviceText)"><Copy class="h-4 w-4" aria-hidden="true" />Скопировать</button></div><p v-if="!selectedUserDevices.length" class="admin-empty">История появится после следующего входа клиента.</p><div v-else class="admin-client-device-list"><article v-for="entry in selectedUserDevices" :key="entry.id" class="admin-client-device-card"><div class="admin-client-device-title"><strong>{{ getClientDeviceTitle(entry.diagnostics) }}</strong><span>{{ getClientDeviceScreen(entry.diagnostics) }}</span></div><div class="admin-client-device-dates"><span>Впервые: {{ formatAdminCompactDateTime(entry.firstSeenAt) }}</span><span>Последний вход: {{ formatAdminCompactDateTime(entry.lastSeenAt) }}</span></div><small>{{ entry.diagnostics.userAgent }}</small></article></div></details>
        <details v-if="canViewLoginIps" class="admin-client-section admin-login-ips-section admin-client-compact-section admin-detail ui-card"><summary>IP входов <span>{{ selectedUserLoginIps.length }} адресов</span></summary><div class="admin-client-section-head admin-client-section-head-hidden"><h4>IP входов</h4><small>{{ selectedUserLoginIps.length }} адресов</small></div><p v-if="selectedUserLoginIpsLoading" class="admin-empty">Загружаю историю IP…</p><p v-else-if="selectedUserLoginIpsError" class="admin-warning-line">Не удалось загрузить историю IP.</p><p v-else-if="!selectedUserLoginIps.length" class="admin-empty">История IP появится после следующего входа клиента.</p><div v-else class="admin-login-ip-list"><article v-for="entry in selectedUserLoginIps" :key="entry.id" class="admin-login-ip-row"><div class="admin-login-ip-main"><strong class="admin-login-ip-address">{{ entry.ipAddress }}</strong><span v-if="isNewLoginIp(entry)" class="admin-login-ip-new">Новый IP</span></div><div class="admin-login-ip-meta"><span>Впервые: {{ formatAdminCompactDateTime(entry.firstSeenAt) }}</span><span>Последний вход: {{ formatAdminCompactDateTime(entry.lastSeenAt) }}</span><span>Входов: {{ entry.loginCount }}</span></div></article></div></details>
      </div>
    </TaskScreen>

    <Teleport to="body"><div v-if="clientMessage.open && selectedUser" class="admin-client-message-layer" @click.self="emit('close-message')"><form class="admin-client-message-modal" role="dialog" aria-modal="true" aria-labelledby="admin-client-message-title" @submit.prevent="emit('submit-message')"><header class="admin-client-message-head"><div><h3 id="admin-client-message-title">Сообщение клиенту</h3><p>{{ userTitle(selectedUser) }} · ID {{ selectedUser.telegramId }}</p></div><button class="icon-button ui-icon-button" type="button" aria-label="Закрыть сообщение клиенту" @click="emit('close-message')"><X class="h-4 w-4" aria-hidden="true" /></button></header><div class="admin-client-message-body"><div class="admin-client-message-row"><label class="support-file-icon-button ui-icon-button admin-client-file-button" title="Добавить файл" aria-label="Добавить файл"><Paperclip class="h-4 w-4" aria-hidden="true" /><span v-if="clientMessage.files.length" class="support-file-count">{{ clientMessage.files.length }}</span><input type="file" accept="image/*,video/*" multiple @change="updateClientMessageFiles" /></label><textarea ref="clientMessageInput" :value="clientMessage.text" rows="3" placeholder="Напишите сообщение клиенту" @input="emit('update:client-message-text', ($event.target as HTMLTextAreaElement).value)" /></div><div v-if="clientMessage.files.length" class="admin-client-file-list"><span v-for="file in clientMessage.files" :key="file.name">{{ file.name }}</span></div></div><button class="primary-button ui-button" type="submit" :disabled="clientMessage.sending">{{ clientMessage.sending ? 'Отправляем...' : 'Отправить' }}</button></form></div></Teleport>
  </section>
</template>
